package main

import (
	"fmt"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Config holds all gateway configuration loaded from environment variables.
type Config struct {
	Port          string
	ZentinelleURL string

	// Keys by provider name, from PROVIDER_KEY_<NAME>. A map rather than a
	// field per provider: three fixed fields meant a fourth provider — Vertex,
	// Azure OpenAI, Mistral, an on-prem endpoint — needed a code change and a
	// rebuild to configure, in a service whose provider table is otherwise
	// data (#226).
	ProviderAPIKeys map[string]string

	// Which tenant and cluster this gateway speaks for, sent on every call to
	// Zentinelle. In the cluster-local pattern one Zentinelle serves many
	// clusters, and without these its events, evaluations and logs cannot be
	// told apart (#227). Empty when the deployment does not use it, in which
	// case no header is sent at all.
	TenantID  string
	ClusterID string

	FailOpen         bool
	PolicyTimeout    time.Duration
	MaxResponseBytes int64
}

// LoadConfig reads configuration from environment variables with sensible defaults.
func LoadConfig() (*Config, error) {
	port := envOr("GATEWAY_PORT", "8742")
	zentinelleURL := strings.TrimRight(envOr("ZENTINELLE_URL", "http://localhost:8080"), "/")

	failOpen := true
	if v := os.Getenv("FAIL_OPEN"); v != "" {
		parsed, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("invalid FAIL_OPEN value %q: %w", v, err)
		}
		failOpen = parsed
	}

	policyTimeoutMs := 2000
	if v := os.Getenv("POLICY_TIMEOUT_MS"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil || parsed < 0 {
			return nil, fmt.Errorf("invalid POLICY_TIMEOUT_MS value %q", v)
		}
		policyTimeoutMs = parsed
	}

	maxBytes := int64(52428800) // 50MB
	if v := os.Getenv("MAX_RESPONSE_BYTES"); v != "" {
		parsed, err := strconv.ParseInt(v, 10, 64)
		if err != nil || parsed < 0 {
			return nil, fmt.Errorf("invalid MAX_RESPONSE_BYTES value %q", v)
		}
		maxBytes = parsed
	}

	return &Config{
		Port:             port,
		ZentinelleURL:    zentinelleURL,
		ProviderAPIKeys:  loadProviderKeys(os.Environ()),
		TenantID:         os.Getenv("ZENTINELLE_TENANT_ID"),
		ClusterID:        os.Getenv("ZENTINELLE_CLUSTER_ID"),
		FailOpen:         failOpen,
		PolicyTimeout:    time.Duration(policyTimeoutMs) * time.Millisecond,
		MaxResponseBytes: maxBytes,
	}, nil
}

// loadProviderKeys reads every PROVIDER_KEY_<NAME> from the environment, plus
// the three original <PROVIDER>_API_KEY variables.
//
// The old names still work, and deliberately: they are in every deployment's
// task definition and compose file, and a rename that silently drops a
// provider's key produces a gateway that starts cleanly and refuses every
// request to that provider. Where both are set the explicit one wins, since
// somebody who wrote PROVIDER_KEY_OPENAI meant it.
func loadProviderKeys(environ []string) map[string]string {
	keys := map[string]string{}

	for _, legacy := range []struct{ env, provider string }{
		{"OPENAI_API_KEY", "openai"},
		{"ANTHROPIC_API_KEY", "anthropic"},
		{"GOOGLE_API_KEY", "google"},
	} {
		if v := os.Getenv(legacy.env); v != "" {
			keys[legacy.provider] = v
		}
	}

	const prefix = "PROVIDER_KEY_"
	for _, entry := range environ {
		name, value, found := strings.Cut(entry, "=")
		if !found || !strings.HasPrefix(name, prefix) || value == "" {
			continue
		}
		// PROVIDER_KEY_AZURE_OPENAI -> azure_openai, matching how a provider
		// names itself in the table rather than inventing a second spelling.
		provider := strings.ToLower(strings.TrimPrefix(name, prefix))
		if provider != "" {
			keys[provider] = value
		}
	}

	return keys
}

// ProviderKeys returns the provider names that have API keys configured,
// sorted so that logs and health output do not reorder between restarts.
func (c *Config) ProviderKeys() []string {
	configured := make([]string, 0, len(c.ProviderAPIKeys))
	for provider, key := range c.ProviderAPIKeys {
		if key != "" {
			configured = append(configured, provider)
		}
	}
	sort.Strings(configured)
	return configured
}

// KeyForProvider returns the API key for the given provider, or empty string.
func (c *Config) KeyForProvider(provider string) string {
	return c.ProviderAPIKeys[provider]
}

// ApplyIdentityHeaders adds the tenant and cluster this gateway speaks for to
// a request bound for Zentinelle. Nothing is sent when they are unset, so a
// single-cluster deployment's requests are unchanged.
func (c *Config) ApplyIdentityHeaders(req *http.Request) {
	if c.TenantID != "" {
		req.Header.Set("X-Zentinelle-Tenant", c.TenantID)
	}
	if c.ClusterID != "" {
		req.Header.Set("X-Zentinelle-Cluster", c.ClusterID)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
