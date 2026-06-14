// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package toolbox

func (s *server) telemetryLabels() map[string]string {
	layer := s.telemetryLayer
	if layer == "" {
		layer = "box"
	}

	labels := map[string]string{
		"boxlite.layer":      layer,
		"boxlite.sandbox_id": s.SandboxId,
	}

	boxId := s.SandboxId
	if s.boxId != nil && *s.boxId != "" {
		boxId = *s.boxId
	}
	labels["boxlite.box_id"] = boxId

	if s.organizationId != nil && *s.organizationId != "" {
		labels["boxlite.org_id"] = *s.organizationId
	}
	if s.regionId != nil && *s.regionId != "" {
		labels["boxlite.region_id"] = *s.regionId
	}

	return labels
}
