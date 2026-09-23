package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"
	"sync"
	"time"
)

// The gateway credential is this gateway's own identity for the provider-key
// lookup (#380). Zentinelle registers each gateway with the tenants it may
// act for and releases a tenant's stored key only to a gateway registered
// for that tenant, so a leaked credential exposes one gateway's tenants and
// is revoked on its own.
//
// It comes from ZENTINELLE_GATEWAY_CREDENTIAL, or from a file: on Kubernetes
// a mounted Secret, and in a standalone compose install a file the backend
// writes into a volume both containers share. A credential from a file is
// read again when the backend refuses it, which is how a rotated credential
// reaches a running gateway.

const (
	// Where a Kubernetes Secret is mounted and a compose backend writes it.
	defaultGatewayCredentialFile = "/var/run/zentinelle/gateway-credential"

	// Every gateway credential Zentinelle mints starts with this.
	gatewayCredentialPrefix = "sk_gateway_"

	// How long to wait at startup for the file. It is normally there
	// already: compose starts the gateway only once the backend is healthy,
	// and a Secret is mounted before the container starts. This covers
	// orchestrators that start both at once.
	gatewayCredentialWait = 60 * time.Second
	gatewayCredentialPoll = time.Second

	// At most one re-read of the credential file per interval, however many
	// lookups are refused in the meantime.
	gatewayCredentialRereadInterval = 10 * time.Second
)

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// validGatewayCredential reports whether value has the shape of a credential
// Zentinelle minted, which catches an agent key or a placeholder pasted into
// the wrong place before it is ever sent anywhere.
func validGatewayCredential(value string) bool {
	return strings.HasPrefix(value, gatewayCredentialPrefix) && len(value) >= len(gatewayCredentialPrefix)+16
}

// readGatewayCredentialFile returns the credential in path, surrounding
// whitespace removed. A missing file is an fs.ErrNotExist error; no error
// carries the file's contents.
func readGatewayCredentialFile(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	credential := strings.TrimSpace(string(raw))
	if !validGatewayCredential(credential) {
		return "", fmt.Errorf("%s does not hold a gateway credential (%s...)", path, gatewayCredentialPrefix)
	}
	return credential, nil
}

// waitForGatewayCredential reads the credential file, waiting up to timeout
// for it to appear. It returns "" without an error when the file never
// appeared; any other failure to read it is an error, since that is a file
// somebody configured and got wrong.
func waitForGatewayCredential(path string, timeout, poll time.Duration) (string, error) {
	credential, err := readGatewayCredentialFile(path)
	if !errors.Is(err, fs.ErrNotExist) {
		return credential, err
	}

	logJSON("info", "waiting for the gateway credential file", map[string]interface{}{
		"path": path, "timeout": timeout.String(),
	})
	start := time.Now()
	lastLog := start
	for time.Since(start) < timeout {
		time.Sleep(poll)
		credential, err = readGatewayCredentialFile(path)
		if !errors.Is(err, fs.ErrNotExist) {
			if err == nil {
				logJSON("info", "gateway credential file found", map[string]interface{}{
					"path": path, "waited": time.Since(start).Round(time.Millisecond).String(),
				})
			}
			return credential, err
		}
		if time.Since(lastLog) >= 10*time.Second {
			logJSON("info", "still waiting for the gateway credential file", map[string]interface{}{
				"path": path, "waited": time.Since(start).Round(time.Second).String(),
			})
			lastLog = time.Now()
		}
	}

	logJSON("warn", "the gateway credential file did not appear", map[string]interface{}{
		"path": path, "waited": timeout.String(),
	})
	return "", nil
}

// gatewayCredential is the credential in use. One from the environment never
// changes. One from a file is read again, at most once per interval, when the
// backend refuses it and while there is none yet.
type gatewayCredential struct {
	mu       sync.Mutex
	value    string
	path     string
	interval time.Duration
	lastRead time.Time
	now      func() time.Time
}

func newGatewayCredential(value, path string) *gatewayCredential {
	return &gatewayCredential{value: value, path: path, interval: gatewayCredentialRereadInterval, now: time.Now}
}

// current returns the credential, first looking in the file when there is none.
func (c *gatewayCredential) current() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.value == "" {
		c.rereadLocked()
	}
	return c.value
}

// reread reads the file again after the backend refused the credential, and
// reports whether that produced a different one worth retrying with.
func (c *gatewayCredential) reread() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	before := c.value
	c.rereadLocked()
	return c.value != "" && c.value != before
}

func (c *gatewayCredential) rereadLocked() {
	if c.path == "" || c.now().Sub(c.lastRead) < c.interval {
		return
	}
	c.lastRead = c.now()

	credential, err := readGatewayCredentialFile(c.path)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			logJSON("warn", "gateway credential file could not be read", map[string]interface{}{
				"path": c.path, "error": err.Error(),
			})
		}
		return
	}
	if credential != c.value {
		logJSON("info", "gateway credential re-read from file", map[string]interface{}{"path": c.path})
		c.value = credential
	}
}
