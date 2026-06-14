// Copyright BoxLite AI (originally Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package config

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	apiclient "github.com/boxlite-ai/boxlite/libs/api-client-go"
	common_cache "github.com/boxlite-ai/common-go/pkg/cache"
	"go.uber.org/zap"
)

// Resolver handles retrieving and caching endpoint configurations.
type Resolver struct {
	cache     common_cache.ICache[apiclient.OtelConfig]
	logger    *zap.Logger
	apiclient *apiclient.APIClient
	cacheTTL  time.Duration
}

// NewResolver creates a new configuration resolver.
func NewResolver(cache common_cache.ICache[apiclient.OtelConfig], logger *zap.Logger, apiClient *apiclient.APIClient, cacheTTL time.Duration) *Resolver {
	return &Resolver{
		cache:     cache,
		logger:    logger,
		apiclient: apiClient,
		cacheTTL:  cacheTTL,
	}
}

func (r *Resolver) GetOrganizationOtelConfig(ctx context.Context, authToken string) (*apiclient.OtelConfig, error) {
	cacheKey := sandboxTokenCacheKey(authToken)
	otelConfig, err := r.cache.Get(ctx, cacheKey)
	if err == nil {
		if otelConfig.Endpoint == "(none)" {
			return nil, nil
		}
		return otelConfig, nil
	}

	otelConfig, res, err := r.getOrganizationOtelConfigBySandboxAuthTokenHeader(ctx, authToken)
	if err != nil && res != nil && res.StatusCode != http.StatusNotFound {
		return nil, err
	}

	// Store this in cache to prevent repeated api calls for orgs that don't have otel endpoints
	config := &apiclient.OtelConfig{
		Endpoint: "(none)",
	}

	if otelConfig != nil {
		config = &apiclient.OtelConfig{
			Endpoint: otelConfig.Endpoint,
			Headers:  otelConfig.Headers,
		}
	}

	if err := r.cache.Set(ctx, cacheKey, *config, r.cacheTTL); err != nil {
		return nil, err
	}

	if config.Endpoint == "(none)" {
		return nil, nil
	}

	return config, nil
}

func (r *Resolver) getOrganizationOtelConfigBySandboxAuthTokenHeader(
	ctx context.Context,
	authToken string,
) (*apiclient.OtelConfig, *http.Response, error) {
	clientConfig := r.apiclient.GetConfig()
	baseURL, err := clientConfig.ServerURL(0, nil)
	if err != nil {
		return nil, nil, err
	}

	endpoint := strings.TrimRight(baseURL, "/") + "/organizations/otel-config/by-sandbox-auth-token"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, nil, err
	}
	for key, value := range clientConfig.DefaultHeader {
		req.Header.Set(key, value)
	}
	req.Header.Set("sandbox-auth-token", authToken)

	httpClient := clientConfig.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, res, err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusNotFound {
		return nil, res, fmt.Errorf("organization OTEL config not found")
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, res, fmt.Errorf("organization OTEL config request failed with status %d", res.StatusCode)
	}

	var config apiclient.OtelConfig
	if err := json.NewDecoder(res.Body).Decode(&config); err != nil {
		return nil, res, err
	}

	return &config, res, nil
}

func sandboxTokenCacheKey(authToken string) string {
	sum := sha256.Sum256([]byte(authToken))
	return hex.EncodeToString(sum[:])
}

// InvalidateCache removes a specific sandbox auth token configuration from the cache.
func (r *Resolver) InvalidateCache(ctx context.Context, authToken string) error {
	return r.cache.Delete(ctx, sandboxTokenCacheKey(authToken))
}
