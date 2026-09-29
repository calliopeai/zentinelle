package main

import (
	"net/url"
	"strings"
)

// Provider describes an upstream LLM API provider.
type Provider struct {
	Name       string
	BaseURL    string
	AuthHeader string
	AuthPrefix string
}

var providers = map[string]Provider{
	"openai": {
		Name:       "openai",
		BaseURL:    "https://api.openai.com",
		AuthHeader: "Authorization",
		AuthPrefix: "Bearer ",
	},
	"anthropic": {
		Name:       "anthropic",
		BaseURL:    "https://api.anthropic.com",
		AuthHeader: "x-api-key",
		AuthPrefix: "",
	},
	"google": {
		Name:       "google",
		BaseURL:    "https://generativelanguage.googleapis.com",
		AuthHeader: "x-goog-api-key",
		AuthPrefix: "",
	},
}

// DetectProvider determines the provider from the request path.
// Returns the provider config and the remaining path to forward upstream.
//
// Path patterns:
//
//	/v1/chat/completions  → openai, /v1/chat/completions
//	/v1/completions       → openai, /v1/completions
//	/v1/models            → openai, /v1/models
//	/v1/messages          → anthropic, /v1/messages
//	/v1beta/models/...    → google, /v1beta/models/...
//	/proxy/{provider}/... → explicit, /{remaining}
func DetectProvider(path string) (Provider, string, bool) {
	// Explicit provider routing: /proxy/{provider}/...
	if strings.HasPrefix(path, "/proxy/") {
		rest := strings.TrimPrefix(path, "/proxy/")
		slashIdx := strings.Index(rest, "/")
		if slashIdx < 0 {
			// /proxy/openai with no trailing path
			provName := rest
			if p, ok := providers[provName]; ok {
				return p, "/", true
			}
			return Provider{}, "", false
		}
		provName := rest[:slashIdx]
		remaining := rest[slashIdx:]
		if p, ok := providers[provName]; ok {
			// For OpenAI explicit routing, prefix /v1 if not already present
			if provName == "openai" && !strings.HasPrefix(remaining, "/v1") {
				remaining = "/v1" + remaining
			}
			return p, remaining, true
		}
		return Provider{}, "", false
	}

	// Auto-detect from path
	switch {
	case strings.HasPrefix(path, "/v1/messages"):
		return providers["anthropic"], path, true

	case strings.HasPrefix(path, "/v1beta/"):
		return providers["google"], path, true

	case strings.HasPrefix(path, "/v1/"):
		return providers["openai"], path, true

	default:
		return Provider{}, "", false
	}
}

// hopByHopHeaders are headers that must not be forwarded to upstream providers.
var hopByHopHeaders = map[string]bool{
	"connection":          true,
	"keep-alive":          true,
	"proxy-authenticate":  true,
	"proxy-authorization": true,
	"te":                  true,
	"trailers":            true,
	"transfer-encoding":   true,
	"upgrade":             true,
	"host":                true,
	"x-zentinelle-key":    true,
	"x-real-ip":           true,
	"x-forwarded-for":     true,
	"x-forwarded-proto":   true,
	"x-forwarded-host":    true,
}

// clientCredentialHeaders carry a provider credential, and the client's are
// never forwarded (#380). The gateway sets the provider's auth header itself.
// All three are dropped whatever the provider: an Anthropic request carrying
// an Authorization bearer, or an OpenAI one carrying x-api-key, would
// otherwise reach the provider with the client's credential beside the
// injected one. Every AuthHeader in the providers table must be listed here,
// and a test holds the table to that.
var clientCredentialHeaders = map[string]bool{
	"authorization":  true,
	"x-api-key":      true,
	"x-goog-api-key": true,
}

// ShouldForwardHeader returns true if the header should be forwarded upstream.
func ShouldForwardHeader(name string) bool {
	lower := strings.ToLower(name)
	return !hopByHopHeaders[lower] && !clientCredentialHeaders[lower]
}

// withoutKeyParam drops the `key` query parameter, which is how Google takes
// an API key in the URL, so a client-supplied key cannot ride along in the
// query string either. None of the routed providers uses `key` for anything
// else. Every other parameter is kept exactly as sent, encoding and order
// included.
func withoutKeyParam(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	kept := make([]string, 0, strings.Count(rawQuery, "&")+1)
	for _, part := range strings.Split(rawQuery, "&") {
		name, _, _ := strings.Cut(part, "=")
		if unescaped, err := url.QueryUnescape(name); err == nil {
			name = unescaped
		}
		if name == "key" {
			continue
		}
		kept = append(kept, part)
	}
	return strings.Join(kept, "&")
}
