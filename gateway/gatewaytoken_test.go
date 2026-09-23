package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Where the gateway token comes from (#380): ZENTINELLE_GATEWAY_TOKEN, else a
// file the backend mints or a Secret mounts, read again when the backend
// refuses the token.

const (
	fileToken    = "file-gateway-token-0123456789abcdef0123456789"
	rotatedToken = "rotated-gateway-token-0123456789abcdef012345"
)

// placeTokenFile writes a token beside path and renames it into place, as
// the backend and the kubelet both do, so a reader never sees half a token.
func placeTokenFile(path, token string) error {
	if err := os.WriteFile(path+".tmp", []byte(token), 0o600); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}

func writeTokenFile(t *testing.T, path, token string) {
	t.Helper()
	if err := placeTokenFile(path, token); err != nil {
		t.Fatal(err)
	}
}

func tokenFileEnv(t *testing.T, path string) {
	t.Helper()
	t.Setenv("ZENTINELLE_GATEWAY_TOKEN", "")
	t.Setenv("ZENTINELLE_GATEWAY_TOKEN_FILE", path)
	t.Setenv("ALLOW_ENV_PROVIDER_KEYS", "")
}

// --- at startup ---

func TestLoadConfigReadsTheTokenFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-token")
	writeTokenFile(t, path, fileToken+"\n")
	tokenFileEnv(t, path)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.GatewayToken != fileToken {
		t.Errorf("token = %q, want the file's, whitespace trimmed", cfg.GatewayToken)
	}
	if cfg.GatewayTokenFile != path {
		t.Errorf("token file = %q, want %q so it can be read again", cfg.GatewayTokenFile, path)
	}
}

func TestAnEnvTokenWinsOverTheFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-token")
	writeTokenFile(t, path, fileToken)
	tokenFileEnv(t, path)
	t.Setenv("ZENTINELLE_GATEWAY_TOKEN", testGatewayToken)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.GatewayToken != testGatewayToken {
		t.Errorf("token = %q, want the explicit one", cfg.GatewayToken)
	}
	if cfg.GatewayTokenFile != "" {
		t.Error("an explicit token would be replaced by re-reading the file")
	}
}

func TestLoadConfigWaitsForTheBackendToMintTheToken(t *testing.T) {
	logs := captureLogs(t)
	path := filepath.Join(t.TempDir(), "gateway-token")
	tokenFileEnv(t, path)
	go func() {
		time.Sleep(300 * time.Millisecond)
		placeTokenFile(path, fileToken)
	}()

	start := time.Now()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.GatewayToken != fileToken {
		t.Errorf("token = %q, want the one that appeared while waiting", cfg.GatewayToken)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Errorf("startup took %v, want the token picked up at the next poll", elapsed)
	}
	logged := logs()
	if !strings.Contains(logged, "waiting for the gateway token file") || !strings.Contains(logged, "gateway token file found") {
		t.Errorf("the wait was not logged: %s", logged)
	}
	if strings.Contains(logged, fileToken) {
		t.Error("the token was logged")
	}
}

func TestWaitingForTheTokenFileIsBounded(t *testing.T) {
	logs := captureLogs(t)
	path := filepath.Join(t.TempDir(), "gateway-token")

	start := time.Now()
	token, err := waitForGatewayToken(path, 300*time.Millisecond, 50*time.Millisecond)
	elapsed := time.Since(start)

	if token != "" || err != nil {
		t.Fatalf("got %q, %v; want no token and no error when it never appears", token, err)
	}
	if elapsed < 300*time.Millisecond || elapsed > 3*time.Second {
		t.Errorf("waited %v, want about the 300ms bound", elapsed)
	}
	if !strings.Contains(logs(), "did not appear") {
		t.Error("giving up was not logged")
	}
}

func TestNothingIsAwaitedWhereNothingIsMounted(t *testing.T) {
	// No directory means no volume and no Secret: the token is not coming.
	tokenFileEnv(t, filepath.Join(t.TempDir(), "not-mounted", "gateway-token"))
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
	if cfg.GatewayToken != "" || cfg.GatewayTokenFile != "" {
		t.Errorf("token %q from %q, want neither", cfg.GatewayToken, cfg.GatewayTokenFile)
	}
}

func TestLoadConfigRefusesAShortTokenFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-token")
	writeTokenFile(t, path, "tiny-token")
	tokenFileEnv(t, path)

	_, err := LoadConfig()
	if err == nil || !strings.Contains(err.Error(), path) {
		t.Fatalf("err = %v, want the short file refused by name", err)
	}
	if strings.Contains(err.Error(), "tiny-token") {
		t.Error("the error echoed the file's contents")
	}
}

// --- while running ---

// rotationGateway serves tenant A's stored key behind a control plane that
// accepts testGatewayToken until a test rotates it, with a clock the test
// moves.
func rotationGateway(t *testing.T, value, path string) (*Gateway, *lookupStub, *upstreamSeen, *time.Time) {
	t.Helper()
	control, stub := controlPlaneStub(t, map[string]map[string]string{
		"sk_agent_tenant_a": {"openai": "sk-stored-tenant-a"},
	})
	upstream, seen := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)

	cfg := storedKeyConfig(control.URL)
	cfg.GatewayToken, cfg.GatewayTokenFile = value, path
	gw := NewGateway(cfg)
	clock := time.Unix(1_700_000_000, 0)
	gw.token.now = func() time.Time { return clock }
	return gw, stub, seen, &clock
}

func rotateControlPlane(stub *lookupStub, token string) {
	stub.mu.Lock()
	stub.token = token
	stub.mu.Unlock()
}

func TestARotatedTokenIsReadAgainAndRetried(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-token")
	writeTokenFile(t, path, testGatewayToken)
	gw, stub, seen, _ := rotationGateway(t, testGatewayToken, path)

	// The backend and the file move on; the gateway still holds the old token.
	rotateControlPlane(stub, rotatedToken)
	writeTokenFile(t, path, rotatedToken)

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
	presented := stub.headers.Get("X-Zentinelle-Gateway-Token")
	stub.mu.Unlock()
	if presented != rotatedToken {
		t.Error("the retry did not present the rotated token")
	}
}

func TestTheTokenFileIsReadAgainAtMostOncePerInterval(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway-token")
	writeTokenFile(t, path, testGatewayToken)
	gw, stub, _, clock := rotationGateway(t, testGatewayToken, path)
	rotateControlPlane(stub, rotatedToken)

	// Refused, and the file still holds the refused token: nothing to retry.
	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil); w.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", w.Code)
	}

	// The file is rotated now, but inside the interval it is not read again.
	writeTokenFile(t, path, rotatedToken)
	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil); w.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 until the interval has passed", w.Code)
	}

	*clock = clock.Add(gatewayTokenRereadInterval)
	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil); w.Code != http.StatusOK {
		t.Errorf("status = %d, want the rotated token read once the interval passed", w.Code)
	}
}

func TestATokenThatAppearsAfterStartupIsPickedUp(t *testing.T) {
	// Startup gave up waiting and fell back to the env keys; the backend
	// mints the token later.
	path := filepath.Join(t.TempDir(), "gateway-token")
	gw, _, seen, clock := rotationGateway(t, "", path)
	gw.cfg.ProviderAPIKeys = map[string]string{"openai": "sk-env-gateway"}
	gw.cfg.AllowEnvProviderKeys = true

	proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil)
	if headers, _ := seen.last(); headers.Get("Authorization") != "Bearer sk-env-gateway" {
		t.Fatalf("Authorization upstream = %q, want the env fallback while there is no token", headers.Get("Authorization"))
	}

	writeTokenFile(t, path, testGatewayToken)
	*clock = clock.Add(gatewayTokenRereadInterval)
	proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil)
	if headers, _ := seen.last(); headers.Get("Authorization") != "Bearer sk-stored-tenant-a" {
		t.Errorf("Authorization upstream = %q, want the tenant's stored key once the token appeared", headers.Get("Authorization"))
	}
}

func TestAnEnvTokenIsNeverReplacedFromAFile(t *testing.T) {
	token := newGatewayToken(testGatewayToken, "")
	if token.reread() || token.current() != testGatewayToken {
		t.Error("an explicit token was replaced")
	}
}

func TestTheTokenIsNeverLoggedWhileWaitingOrRotating(t *testing.T) {
	logs := captureLogs(t)
	path := filepath.Join(t.TempDir(), "gateway-token")
	go func() {
		time.Sleep(100 * time.Millisecond)
		placeTokenFile(path, fileToken)
	}()
	if token, err := waitForGatewayToken(path, 5*time.Second, 20*time.Millisecond); token != fileToken || err != nil {
		t.Fatalf("waitForGatewayToken = %q, %v", token, err)
	}

	gw, stub, _, _ := rotationGateway(t, fileToken, path)
	rotateControlPlane(stub, rotatedToken)
	writeTokenFile(t, path, rotatedToken)
	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil); w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	logged := logs()
	if !strings.Contains(logged, "gateway token file found") || !strings.Contains(logged, "gateway token re-read from file") {
		t.Fatalf("the wait and the rotation were not logged, so this test proves nothing: %s", logged)
	}
	for _, secret := range []string{fileToken, rotatedToken} {
		if strings.Contains(logged, secret) {
			t.Errorf("%q appears in the gateway's logs", secret)
		}
	}
}

func TestStartupNamesTheTokenSourceAndTheDeprecatedFallback(t *testing.T) {
	for _, allow := range []bool{true, false} {
		t.Run(map[bool]string{true: "fallback on", false: "fallback off"}[allow], func(t *testing.T) {
			logs := captureLogs(t)
			logStartup(&Config{
				GatewayToken: fileToken, GatewayTokenFile: "/var/run/zentinelle/gateway-token",
				ProviderAPIKeys: map[string]string{"openai": "sk-env"}, AllowEnvProviderKeys: allow,
			})

			logged := logs()
			if !strings.Contains(logged, `"gateway_token_source":"file"`) {
				t.Errorf("the token source was not logged: %s", logged)
			}
			if deprecated := strings.Contains(logged, "ALLOW_ENV_PROVIDER_KEYS is deprecated"); deprecated != allow {
				t.Errorf("deprecation warning logged = %v, want %v", deprecated, allow)
			}
			if strings.Contains(logged, fileToken) {
				t.Error("the token was logged")
			}
		})
	}
}
