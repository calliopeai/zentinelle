package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// Provider keys come from Zentinelle, per tenant (#380).
//
// The gateway used to inject keys from its own environment, so one deployment
// served every tenant on one set of provider accounts, and a tenant wanting
// its own had to keep the key in the agent's pod, which is the thing the
// gateway exists to prevent. Now the key is the one the agent's tenant stored
// in Zentinelle, read with the agent key (which names the tenant) plus the
// gateway token (which says the caller may read raw keys at all).
//
// The gateway's env keys remain as a fallback for a tenant with no stored
// key, and only when ALLOW_ENV_PROVIDER_KEYS is set. That fallback is
// single-tenant by nature, since it serves whoever reaches it on one account,
// and it is deprecated: per-tenant stored keys replace it.

const (
	// A minute: long enough that a busy agent does not look its key up on
	// every call, short enough that a revoked or rotated key stops being used
	// soon after. Negative answers are cached for the same time, so a key
	// stored for a tenant that had none can take up to this long to be used.
	providerKeyCacheTTL = 60 * time.Second

	// The cache is keyed per agent key, and agent keys can be per task, so it
	// is bounded rather than left to grow with every task a cluster has run.
	providerKeyCacheMaxEntries = 10000

	// Matches the backend, which refuses a shorter token.
	minGatewayTokenLength = 32
)

// providerKeyNotFoundCode is the error code the backend answers with when the
// tenant has no usable key for the provider. A 404 without it, a route the
// backend does not have for instance, is a failed lookup rather than an
// answer, and must not lead to the env fallback.
const providerKeyNotFoundCode = "provider_key_not_found"

// errLookupRefused is a 401 or 403 from the lookup: the backend did not accept
// the credentials, which after a rotation means the token this gateway holds.
var errLookupRefused = errors.New("provider key lookup refused the gateway credentials")

// providerKeyError is a request that cannot be sent because no provider key
// could be settled on. cause is for the log and never holds a key.
type providerKeyError struct {
	status int
	code   string
	detail string
	cause  error
}

// resolveProviderKey returns the key to send upstream for this agent and
// provider, and where it came from ("tenant" or "env") for the log.
//
// The order is the policy: the tenant's stored key, then the gateway's own
// key only where that fallback is explicitly allowed. A lookup that fails,
// rather than answering that there is no key, never falls back: serving a
// tenant on another account's key because Zentinelle was unreachable is a
// silent cross-tenant bill, not a recovery.
func (g *Gateway) resolveProviderKey(ctx context.Context, agentKey, provider string) (string, string, *providerKeyError) {
	if token := g.token.current(); token != "" {
		key, found, cached := g.keys.get(agentKey, provider)
		if !cached {
			var err error
			key, found, err = LookupProviderKey(ctx, g.cfg, token, agentKey, provider)
			// A refused token may have been rotated: read its file again and,
			// if that gives a different token, retry once with it.
			if errors.Is(err, errLookupRefused) && g.token.reread() {
				key, found, err = LookupProviderKey(ctx, g.cfg, g.token.current(), agentKey, provider)
			}
			if err != nil {
				return "", "", &providerKeyError{
					status: http.StatusBadGateway,
					code:   "provider_key_lookup_failed",
					detail: fmt.Sprintf("could not resolve the %s key for this agent", provider),
					cause:  err,
				}
			}
			g.keys.put(agentKey, provider, key, found)
		}
		if found {
			return key, "tenant", nil
		}
	}

	if g.cfg.AllowEnvProviderKeys {
		if key := g.cfg.KeyForProvider(provider); key != "" {
			return key, "env", nil
		}
	}

	return "", "", &providerKeyError{
		status: http.StatusServiceUnavailable,
		code:   "no_api_key",
		detail: fmt.Sprintf("no API key configured for provider %s", provider),
	}
}

// LookupProviderKey asks Zentinelle for the stored key of the agent's tenant,
// presenting token as the gateway credential. found is false, with no error,
// only when Zentinelle answers that the tenant has no usable key for this
// provider. Errors never carry a response body.
func LookupProviderKey(ctx context.Context, cfg *Config, token, agentKey, provider string) (key string, found bool, err error) {
	reqBody, err := json.Marshal(map[string]string{"provider": provider})
	if err != nil {
		return "", false, fmt.Errorf("failed to marshal provider key request: %w", err)
	}

	lookupCtx, cancel := context.WithTimeout(ctx, cfg.PolicyTimeout)
	defer cancel()

	url := cfg.ZentinelleURL + "/api/zentinelle/v1/gateway/provider-key"
	req, err := http.NewRequestWithContext(lookupCtx, http.MethodPost, url, bytes.NewReader(reqBody))
	if err != nil {
		return "", false, fmt.Errorf("failed to create provider key request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Zentinelle-Key", agentKey)
	req.Header.Set("X-Zentinelle-Gateway-Token", token)
	cfg.ApplyIdentityHeaders(req)

	resp, err := policyClient.Do(req)
	if err != nil {
		return "", false, fmt.Errorf("provider key lookup failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return "", false, fmt.Errorf("failed to read provider key response: %w", err)
	}

	var parsed struct {
		APIKey string `json:"api_key"`
		Error  string `json:"error"`
	}
	switch resp.StatusCode {
	case http.StatusOK:
		if err := json.Unmarshal(respBody, &parsed); err != nil {
			return "", false, errors.New("failed to parse provider key response")
		}
		if parsed.APIKey == "" {
			return "", false, errors.New("provider key response carried no key")
		}
		return parsed.APIKey, true, nil
	case http.StatusNotFound:
		if json.Unmarshal(respBody, &parsed) == nil && parsed.Error == providerKeyNotFoundCode {
			return "", false, nil
		}
		return "", false, errors.New("provider key lookup returned status 404 without an answer")
	case http.StatusUnauthorized, http.StatusForbidden:
		return "", false, fmt.Errorf("%w (status %d)", errLookupRefused, resp.StatusCode)
	default:
		return "", false, fmt.Errorf("provider key lookup returned status %d", resp.StatusCode)
	}
}

// providerKeyCache holds lookup answers, found or not, for a short time.
//
// Keyed by a hash of the agent key rather than the key itself, so the map
// does not keep every agent key it has seen. An entry is only ever served to
// a request whose policy check has just passed with that same agent key, so a
// revoked agent key stops working at once; the TTL bounds only how long a
// revoked or rotated provider key goes on being used.
type providerKeyCache struct {
	mu         sync.Mutex
	ttl        time.Duration
	maxEntries int
	now        func() time.Time
	entries    map[providerKeyCacheKey]providerKeyCacheEntry
}

type providerKeyCacheKey struct {
	agent    [sha256.Size]byte
	provider string
}

type providerKeyCacheEntry struct {
	key     string
	found   bool
	expires time.Time
}

func newProviderKeyCache(ttl time.Duration, maxEntries int) *providerKeyCache {
	return &providerKeyCache{
		ttl:        ttl,
		maxEntries: maxEntries,
		now:        time.Now,
		entries:    map[providerKeyCacheKey]providerKeyCacheEntry{},
	}
}

func cacheKeyFor(agentKey, provider string) providerKeyCacheKey {
	return providerKeyCacheKey{agent: sha256.Sum256([]byte(agentKey)), provider: provider}
}

// get returns a live entry. ok is false on a miss or an expired entry.
func (c *providerKeyCache) get(agentKey, provider string) (key string, found bool, ok bool) {
	k := cacheKeyFor(agentKey, provider)

	c.mu.Lock()
	defer c.mu.Unlock()

	entry, hit := c.entries[k]
	if !hit {
		return "", false, false
	}
	if !c.now().Before(entry.expires) {
		delete(c.entries, k)
		return "", false, false
	}
	return entry.key, entry.found, true
}

// put stores an answer. When the cache is full it first drops expired
// entries, then arbitrary ones, since any entry can be looked up again.
func (c *providerKeyCache) put(agentKey, provider, key string, found bool) {
	k := cacheKeyFor(agentKey, provider)

	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	if _, exists := c.entries[k]; !exists && len(c.entries) >= c.maxEntries {
		for ek, entry := range c.entries {
			if !now.Before(entry.expires) {
				delete(c.entries, ek)
			}
		}
		for ek := range c.entries {
			if len(c.entries) < c.maxEntries {
				break
			}
			delete(c.entries, ek)
		}
	}
	c.entries[k] = providerKeyCacheEntry{key: key, found: found, expires: now.Add(c.ttl)}
}
