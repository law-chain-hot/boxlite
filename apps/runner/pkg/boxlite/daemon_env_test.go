// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package boxlite

import (
	"testing"

	dto "github.com/boxlite-ai/runner/pkg/api/dto"
)

func TestDaemonTelemetryEnvInjectsSandboxScope(t *testing.T) {
	authToken := "sandbox-token"
	otelEndpoint := "http://otel-collector:4318"
	organizationId := "org-1"
	regionId := "us"
	sandbox := dto.CreateSandboxDTO{
		Id:             "sandbox-1",
		BoxId:          "box-1",
		AuthToken:      &authToken,
		OtelEndpoint:   &otelEndpoint,
		OrganizationId: &organizationId,
		RegionId:       &regionId,
	}

	env := daemonTelemetryEnv(sandbox)

	expected := map[string]string{
		"BOXLITE_SANDBOX_ID":       "sandbox-1",
		"BOXLITE_BOX_ID":           "box-1",
		"BOXLITE_AUTH_TOKEN":       "sandbox-token",
		"BOXLITE_OTEL_ENDPOINT":    "http://otel-collector:4318",
		"BOXLITE_ORGANIZATION_ID":  "org-1",
		"BOXLITE_REGION_ID":        "us",
		"BOXLITE_TELEMETRY_LAYER":  "box",
		"BOXLITE_TELEMETRY_SOURCE": "daemon",
	}
	for key, value := range expected {
		if env[key] != value {
			t.Fatalf("expected %s=%q, got %q", key, value, env[key])
		}
	}
}

func TestDaemonTelemetryEnvFallsBackToSandboxIdForBoxId(t *testing.T) {
	env := daemonTelemetryEnv(dto.CreateSandboxDTO{Id: "sandbox-1"})

	if env["BOXLITE_BOX_ID"] != "sandbox-1" {
		t.Fatalf("expected public box id to fall back to sandbox id, got %q", env["BOXLITE_BOX_ID"])
	}
}
