package config

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	apiclient "github.com/boxlite-ai/boxlite/libs/api-client-go"
	common_cache "github.com/boxlite-ai/common-go/pkg/cache"
	"go.uber.org/zap"
)

func TestResolverFetchesOtelConfigWithSandboxTokenHeader(t *testing.T) {
	const sandboxToken = "sandbox-secret-token"
	var observedPath string
	var observedAuthHeader string
	var observedSandboxHeader string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observedPath = r.URL.String()
		observedAuthHeader = r.Header.Get("Authorization")
		observedSandboxHeader = r.Header.Get("sandbox-auth-token")

		if strings.Contains(r.URL.String(), sandboxToken) {
			t.Fatalf("sandbox token leaked into request URL: %s", r.URL.String())
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"endpoint":"https://otel.example/v1","headers":{"x-boxlite":"ok"}}`))
	}))
	defer server.Close()

	clientConfig := apiclient.NewConfiguration()
	clientConfig.Servers = apiclient.ServerConfigurations{{URL: server.URL}}
	clientConfig.AddDefaultHeader("Authorization", "Bearer otel-collector-key")
	apiClient := apiclient.NewAPIClient(clientConfig)
	resolver := NewResolver(common_cache.NewMapCache[apiclient.OtelConfig](context.Background()), zap.NewNop(), apiClient, time.Minute)

	config, err := resolver.GetOrganizationOtelConfig(context.Background(), sandboxToken)
	if err != nil {
		t.Fatalf("expected resolver to fetch config: %v", err)
	}
	if config == nil || config.Endpoint != "https://otel.example/v1" {
		t.Fatalf("unexpected config: %#v", config)
	}
	if observedPath != "/organizations/otel-config/by-sandbox-auth-token" {
		t.Fatalf("unexpected request path: %s", observedPath)
	}
	if observedAuthHeader != "Bearer otel-collector-key" {
		t.Fatalf("unexpected authorization header: %q", observedAuthHeader)
	}
	if observedSandboxHeader != sandboxToken {
		t.Fatalf("sandbox token was not sent as a header")
	}
}

func TestSandboxTokenCacheKeyDoesNotExposeRawToken(t *testing.T) {
	const sandboxToken = "sandbox-secret-token"
	key := sandboxTokenCacheKey(sandboxToken)
	if key == sandboxToken || strings.Contains(key, sandboxToken) {
		t.Fatalf("cache key exposes raw sandbox token: %s", key)
	}
	if len(key) != 64 {
		t.Fatalf("expected sha256 hex cache key, got %q", key)
	}
}
