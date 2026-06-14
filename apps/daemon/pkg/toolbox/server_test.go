// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package toolbox

import (
	"io"
	"log/slog"
	"testing"
)

func TestNewServerCarriesStartupTelemetryAuthToken(t *testing.T) {
	token := "sandbox-token"
	endpoint := "http://otel-collector:4318"

	server := NewServer(ServerConfig{
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		SandboxId:    "sandbox-1",
		AuthToken:    &token,
		OtelEndpoint: &endpoint,
	})

	if server.authToken != token {
		t.Fatalf("expected startup auth token %q, got %q", token, server.authToken)
	}
	if server.otelEndpoint == nil || *server.otelEndpoint != endpoint {
		t.Fatalf("expected startup otel endpoint %q, got %#v", endpoint, server.otelEndpoint)
	}
}
