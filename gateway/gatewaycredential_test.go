package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Where the gateway's own credential comes from (#380):
// ZENTINELLE_GATEWAY_CREDENTIAL, else a file a Secret mounts or a compose
// backend writes, read again when the backend refuses it.

const (
	fileCredential    = "sk_gateway_file-0123456789abcdefghijklmnop"
	rotatedCredential = "sk_gateway_rotated-0123456789abcdefghijklm"
)

// placeCredentialFile writes a credential beside path and renames it into place, as
// the backend and the kubelet both do, so a reader never sees half a credential.
func placeCredentialFile(path, credential string) error {
	if err := os.WriteFile(path+".tmp", []byte(credential), 0o600); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}

func writeCredentialFile(t *testing.T, path, credential string) {
	t.Helper()
	if err := placeCredentialFile(path, credential); err != nil {
		t.Fatal(err)
	}
}

func credentialFileEnv(t *testing.T, path string) {
	t.Helper()
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", "")
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL_FILE", path)
	t.Setenv("ALLOW_ENV_PROVIDER_KEYS", "")
}

// --- at startup ---

func TestLoadConfigReadsTheCredentialFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-credential")
	writeCredentialFile(t, path, fileCredential+"\n")
	credentialFileEnv(t, path)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.GatewayCredential != fileCredential {
		t.Errorf("credential = %q, want the file's, whitespace trimmed", cfg.GatewayCredential)
	}
	if cfg.GatewayCredentialFile != path {
		t.Errorf("credential file = %q, want %q so it can be read again", cfg.GatewayCredentialFile, path)
	}
}

func TestAnEnvCredentialWinsOverTheFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-credential")
	writeCredentialFile(t, path, fileCredential)
	credentialFileEnv(t, path)
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", testGatewayCredential)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.GatewayCredential != testGatewayCredential {
		t.Errorf("credential = %q, want the explicit one", cfg.GatewayCredential)
	}
	if cfg.GatewayCredentialFile != "" {
		t.Error("an explicit credential would be replaced by re-reading the file")
	}
}

func TestLoadConfigWaitsForTheBackendToMintTheCredential(t *testing.T) {
	logs := captureLogs(t)
	path := filepath.Join(t.TempDir(), "gateway-credential")
	credentialFileEnv(t, path)
	go func() {
		time.Sleep(300 * time.Millisecond)
		placeCredentialFile(path, fileCredential)
	}()

	start := time.Now()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.GatewayCredential != fileCredential {
		t.Errorf("credential = %q, want the one that appeared while waiting", cfg.GatewayCredential)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Errorf("startup took %v, want the credential picked up at the next poll", elapsed)
	}
	logged := logs()
	if !strings.Contains(logged, "waiting for the gateway credential file") || !strings.Contains(logged, "gateway credential file found") {
		t.Errorf("the wait was not logged: %s", logged)
	}
	if strings.Contains(logged, fileCredential) {
		t.Error("the credential was logged")
	}
}

func TestWaitingForTheCredentialFileIsBounded(t *testing.T) {
	logs := captureLogs(t)
	path := filepath.Join(t.TempDir(), "gateway-credential")

	start := time.Now()
	credential, err := waitForGatewayCredential(path, 300*time.Millisecond, 50*time.Millisecond)
	elapsed := time.Since(start)

	if credential != "" || err != nil {
		t.Fatalf("got %q, %v; want no credential and no error when it never appears", credential, err)
	}
	if elapsed < 300*time.Millisecond || elapsed > 3*time.Second {
		t.Errorf("waited %v, want about the 300ms bound", elapsed)
	}
	if !strings.Contains(logs(), "did not appear") {
		t.Error("giving up was not logged")
	}
}

func TestNothingIsAwaitedWhereNothingIsMounted(t *testing.T) {
	// No directory means no volume and no Secret: the credential is not coming.
	credentialFileEnv(t, filepath.Join(t.TempDir(), "not-mounted", "gateway-credential"))
	t.Setenv("ALLOW_ENV_PROVIDER_KEYS", "true")
	t.Setenv("OPENAI_API_KEY", "sk-env")

	start := time.Now()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("startup waited %v for a file that cannot appear", elapsed)
	}
	if cfg.GatewayCredential != "" || cfg.GatewayCredentialFile != "" {
		t.Errorf("credential %q from %q, want neither", cfg.GatewayCredential, cfg.GatewayCredentialFile)
	}
}

func TestLoadConfigRefusesAFileWithoutACredential(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-credential")
	writeCredentialFile(t, path, "not-a-credential")
	credentialFileEnv(t, path)

	_, err := LoadConfig()
	if err == nil || !strings.Contains(err.Error(), path) {
		t.Fatalf("err = %v, want the short file refused by name", err)
	}
	if strings.Contains(err.Error(), "not-a-credential") {
		t.Error("the error echoed the file's contents")
	}
}

// --- while running ---

// rotationGateway serves tenant A's stored key behind a control plane that
// accepts testGatewayCredential until a test rotates it, with a clock the test
// moves.
func rotationGateway(t *testing.T, value, path string) (*Gateway, *lookupStub, *upstreamSeen, *time.Time) {
	t.Helper()
	control, stub := controlPlaneStub(t, map[string]map[string]string{
		"sk_agent_tenant_a": {"openai": "sk-stored-tenant-a"},
	})
	upstream, seen := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)

	cfg := storedKeyConfig(control.URL)
	cfg.GatewayCredential, cfg.GatewayCredentialFile = value, path
	gw := NewGateway(cfg)
	clock := time.Unix(1_700_000_000, 0)
	gw.credential.now = func() time.Time { return clock }
	return gw, stub, seen, &clock
}

func rotateControlPlane(stub *lookupStub, credential string) {
	stub.mu.Lock()
	stub.credential = credential
	stub.mu.Unlock()
}

func TestARotatedCredentialIsReadAgainAndRetried(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-credential")
	writeCredentialFile(t, path, testGatewayCredential)
	gw, stub, seen, _ := rotationGateway(t, testGatewayCredential, path)

	// The backend and the file move on; the gateway still holds the old credential.
	rotateControlPlane(stub, rotatedCredential)
	writeCredentialFile(t, path, rotatedCredential)

	w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if headers, _ := seen.last(); headers.Get("Authorization") != "Bearer sk-stored-tenant-a" {
		t.Errorf("Authorization upstream = %q, want the tenant's stored key", headers.Get("Authorization"))
	}
	if got := stub.callCount(); got != 2 {
		t.Errorf("%d lookups, want the refused one and one retry", got)
	}
	stub.mu.Lock()
	presented := stub.headers.Get("X-Zentinelle-Gateway-Credential")
	stub.mu.Unlock()
	if presented != rotatedCredential {
		t.Error("the retry did not present the rotated credential")
	}
}

func TestTheCredentialFileIsReadAgainAtMostOncePerInterval(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-credential")
	writeCredentialFile(t, path, testGatewayCredential)
	gw, stub, _, clock := rotationGateway(t, testGatewayCredential, path)
	rotateControlPlane(stub, rotatedCredential)

	// Refused, and the file still holds the refused credential: nothing to retry.
	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil); w.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", w.Code)
	}

	// The file is rotated now, but inside the interval it is not read again.
	writeCredentialFile(t, path, rotatedCredential)
	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil); w.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 until the interval has passed", w.Code)
	}

	*clock = clock.Add(gatewayCredentialRereadInterval)
	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil); w.Code != http.StatusOK {
		t.Errorf("status = %d, want the rotated credential read once the interval passed", w.Code)
	}
}

func TestACredentialThatAppearsAfterStartupIsPickedUp(t *testing.T) {
	// Startup gave up waiting and fell back to the env keys; the backend
	// mints the credential later.
	path := filepath.Join(t.TempDir(), "gateway-credential")
	gw, _, seen, clock := rotationGateway(t, "", path)
	gw.cfg.ProviderAPIKeys = map[string]string{"openai": "sk-env-gateway"}
	gw.cfg.AllowEnvProviderKeys = true

	proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil)
	if headers, _ := seen.last(); headers.Get("Authorization") != "Bearer sk-env-gateway" {
		t.Fatalf("Authorization upstream = %q, want the env fallback while there is no credential", headers.Get("Authorization"))
	}

	writeCredentialFile(t, path, testGatewayCredential)
	*clock = clock.Add(gatewayCredentialRereadInterval)
	proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil)
	if headers, _ := seen.last(); headers.Get("Authorization") != "Bearer sk-stored-tenant-a" {
		t.Errorf("Authorization upstream = %q, want the tenant's stored key once the credential appeared", headers.Get("Authorization"))
	}
}

func TestAnEnvCredentialIsNeverReplacedFromAFile(t *testing.T) {
	credential := newGatewayCredential(testGatewayCredential, "")
	if credential.reread() || credential.current() != testGatewayCredential {
		t.Error("an explicit credential was replaced")
	}
}

func TestTheCredentialIsNeverLoggedWhileWaitingOrRotating(t *testing.T) {
	logs := captureLogs(t)
	path := filepath.Join(t.TempDir(), "gateway-credential")
	go func() {
		time.Sleep(100 * time.Millisecond)
		placeCredentialFile(path, fileCredential)
	}()
	if credential, err := waitForGatewayCredential(path, 5*time.Second, 20*time.Millisecond); credential != fileCredential || err != nil {
		t.Fatalf("waitForGatewayCredential = %q, %v", credential, err)
	}

	gw, stub, _, _ := rotationGateway(t, fileCredential, path)
	rotateControlPlane(stub, rotatedCredential)
	writeCredentialFile(t, path, rotatedCredential)
	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil); w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	logged := logs()
	if !strings.Contains(logged, "gateway credential file found") || !strings.Contains(logged, "gateway credential re-read from file") {
		t.Fatalf("the wait and the rotation were not logged, so this test proves nothing: %s", logged)
	}
	for _, secret := range []string{fileCredential, rotatedCredential} {
		if strings.Contains(logged, secret) {
			t.Errorf("%q appears in the gateway's logs", secret)
		}
	}
}

func TestStartupNamesTheCredentialSourceAndTheDeprecatedFallback(t *testing.T) {
	for _, allow := range []bool{true, false} {
		t.Run(map[bool]string{true: "fallback on", false: "fallback off"}[allow], func(t *testing.T) {
			logs := captureLogs(t)
			logStartup(&Config{
				GatewayCredential: fileCredential, GatewayCredentialFile: "/var/run/zentinelle/gateway-credential",
				ProviderAPIKeys: map[string]string{"openai": "sk-env"}, AllowEnvProviderKeys: allow,
			})

			logged := logs()
			if !strings.Contains(logged, `"gateway_credential_source":"file"`) {
				t.Errorf("the credential source was not logged: %s", logged)
			}
			if deprecated := strings.Contains(logged, "ALLOW_ENV_PROVIDER_KEYS is deprecated"); deprecated != allow {
				t.Errorf("deprecation warning logged = %v, want %v", deprecated, allow)
			}
			if strings.Contains(logged, fileCredential) {
				t.Error("the credential was logged")
			}
		})
	}
}
