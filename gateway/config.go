package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all gateway configuration loaded from environment variables.
type Config struct {
	Port             string
	ZentinelleURL    string
	OpenAIKey        string
	AnthropicKey     string
	GoogleKey        string
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
		OpenAIKey:        os.Getenv("OPENAI_API_KEY"),
		AnthropicKey:     os.Getenv("ANTHROPIC_API_KEY"),
		GoogleKey:        os.Getenv("GOOGLE_API_KEY"),
		FailOpen:         failOpen,
		PolicyTimeout:    time.Duration(policyTimeoutMs) * time.Millisecond,
		MaxResponseBytes: maxBytes,
	}, nil
}

// ProviderKeys returns a list of provider names that have API keys configured.
func (c *Config) ProviderKeys() []string {
	var configured []string
	if c.OpenAIKey != "" {
		configured = append(configured, "openai")
	}
	if c.AnthropicKey != "" {
		configured = append(configured, "anthropic")
	}
	if c.GoogleKey != "" {
		configured = append(configured, "google")
	}
	return configured
}

// KeyForProvider returns the API key for the given provider, or empty string.
func (c *Config) KeyForProvider(provider string) string {
	switch provider {
	case "openai":
		return c.OpenAIKey
	case "anthropic":
		return c.AnthropicKey
	case "google":
		return c.GoogleKey
	default:
		return ""
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
