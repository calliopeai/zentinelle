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

// The gateway token is the credential for the provider-key lookup (#380).
// It comes from ZENTINELLE_GATEWAY_TOKEN, or from a file: a compose backend
// mints one into a volume both containers share, and on Kubernetes it is a
// mounted Secret. A token from a file is read again when the backend stops
// accepting it, which is how a rotated token reaches a running gateway.

const (
	// Where the backend mints the token, and where the Kubernetes manifest
	// mounts the Secret.
	defaultGatewayTokenFile = "/var/run/zentinelle/gateway-token"

	// How long to wait at startup for the backend to mint the token. The
	// file is normally there already: compose starts the gateway only once
	// the backend is healthy, and a Secret is mounted before the container
	// starts. This covers orchestrators that start both at once.
	gatewayTokenWait = 60 * time.Second
	gatewayTokenPoll = time.Second

	// At most one re-read of the token file per interval, however many
	// lookups are refused in the meantime.
	gatewayTokenRereadInterval = 10 * time.Second
)

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// readGatewayTokenFile returns the token in path, surrounding whitespace
// removed. A missing file is an fs.ErrNotExist error; no error carries the
// file's contents.
func readGatewayTokenFile(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	token := strings.TrimSpace(string(raw))
	if len(token) < minGatewayTokenLength {
		return "", fmt.Errorf("gateway token file %s holds fewer than %d characters", path, minGatewayTokenLength)
	}
	return token, nil
}

// waitForGatewayToken reads the token file, waiting up to timeout for it to
// appear. It returns "" without an error when the file never appeared; any
// other failure to read it is an error, since that is a file somebody
// configured and got wrong.
func waitForGatewayToken(path string, timeout, poll time.Duration) (string, error) {
	token, err := readGatewayTokenFile(path)
	if !errors.Is(err, fs.ErrNotExist) {
		return token, err
	}

	logJSON("info", "waiting for the gateway token file", map[string]interface{}{
		"path": path, "timeout": timeout.String(),
	})
	start := time.Now()
	lastLog := start
	for time.Since(start) < timeout {
		time.Sleep(poll)
		token, err = readGatewayTokenFile(path)
		if !errors.Is(err, fs.ErrNotExist) {
			if err == nil {
				logJSON("info", "gateway token file found", map[string]interface{}{
					"path": path, "waited": time.Since(start).Round(time.Millisecond).String(),
				})
			}
			return token, err
		}
		if time.Since(lastLog) >= 10*time.Second {
			logJSON("info", "still waiting for the gateway token file", map[string]interface{}{
				"path": path, "waited": time.Since(start).Round(time.Second).String(),
			})
			lastLog = time.Now()
		}
	}

	logJSON("warn", "the gateway token file did not appear", map[string]interface{}{
		"path": path, "waited": timeout.String(),
	})
	return "", nil
}

// gatewayToken is the token in use. One from the environment never changes.
// One from a file is read again, at most once per interval, when the backend
// refuses it and while there is none yet.
type gatewayToken struct {
	mu       sync.Mutex
	value    string
	path     string
	interval time.Duration
	lastRead time.Time
	now      func() time.Time
}

func newGatewayToken(value, path string) *gatewayToken {
	return &gatewayToken{value: value, path: path, interval: gatewayTokenRereadInterval, now: time.Now}
}

// current returns the token, first looking in the file when there is none.
func (t *gatewayToken) current() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.value == "" {
		t.rereadLocked()
	}
	return t.value
}

// reread reads the file again after the backend refused the token, and
// reports whether that produced a different token worth retrying with.
func (t *gatewayToken) reread() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	before := t.value
	t.rereadLocked()
	return t.value != "" && t.value != before
}

func (t *gatewayToken) rereadLocked() {
	if t.path == "" || t.now().Sub(t.lastRead) < t.interval {
		return
	}
	t.lastRead = t.now()

	token, err := readGatewayTokenFile(t.path)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			logJSON("warn", "gateway token file could not be read", map[string]interface{}{
				"path": t.path, "error": err.Error(),
			})
		}
		return
	}
	if token != t.value {
		logJSON("info", "gateway token re-read from file", map[string]interface{}{"path": t.path})
		t.value = token
	}
}
