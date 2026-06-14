// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package main

import (
	"testing"

	"github.com/boxlite-ai/runner/cmd/runner/config"
)

func TestRunnerTelemetryConfigLabelsRunnerLayer(t *testing.T) {
	cfg := &config.Config{
		OtelEndpoint: "http://otel.local:4318",
		OtelHeaders:  "authorization=Bearer token",
		Environment:  "dev",
		Domain:       "runner.example.internal",
	}

	telemetryConfig := runnerTelemetryConfig(cfg)

	if telemetryConfig.Endpoint != "http://otel.local:4318" {
		t.Fatalf("unexpected endpoint: %s", telemetryConfig.Endpoint)
	}
	if telemetryConfig.ServiceName != "boxlite-runner" {
		t.Fatalf("unexpected service name: %s", telemetryConfig.ServiceName)
	}
	if got := telemetryConfig.ExtraLabels["boxlite.layer"]; got != "runner" {
		t.Fatalf("expected runner layer label, got %q", got)
	}
	if got := telemetryConfig.ExtraLabels["boxlite.runner_domain"]; got != "runner.example.internal" {
		t.Fatalf("expected runner domain label, got %q", got)
	}
}
