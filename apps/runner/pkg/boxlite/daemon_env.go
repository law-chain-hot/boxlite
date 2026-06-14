// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package boxlite

import dto "github.com/boxlite-ai/runner/pkg/api/dto"

func daemonTelemetryEnv(sandboxDto dto.CreateSandboxDTO) map[string]string {
	boxId := sandboxDto.BoxId
	if boxId == "" {
		boxId = sandboxDto.Id
	}

	env := map[string]string{
		"BOXLITE_SANDBOX_ID":       sandboxDto.Id,
		"BOXLITE_BOX_ID":           boxId,
		"BOXLITE_TELEMETRY_LAYER":  "box",
		"BOXLITE_TELEMETRY_SOURCE": "daemon",
	}

	if sandboxDto.AuthToken != nil && *sandboxDto.AuthToken != "" {
		env["BOXLITE_AUTH_TOKEN"] = *sandboxDto.AuthToken
	}
	if sandboxDto.OtelEndpoint != nil && *sandboxDto.OtelEndpoint != "" {
		env["BOXLITE_OTEL_ENDPOINT"] = *sandboxDto.OtelEndpoint
	}
	if sandboxDto.OrganizationId != nil && *sandboxDto.OrganizationId != "" {
		env["BOXLITE_ORGANIZATION_ID"] = *sandboxDto.OrganizationId
	}
	if sandboxDto.RegionId != nil && *sandboxDto.RegionId != "" {
		env["BOXLITE_REGION_ID"] = *sandboxDto.RegionId
	}

	return env
}
