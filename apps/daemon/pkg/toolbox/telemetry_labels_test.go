// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package toolbox

import "testing"

func TestTelemetryLabelsIncludeBoxScope(t *testing.T) {
	boxId := "box-1"
	organizationId := "org-1"
	regionId := "iad"
	s := &server{
		SandboxId:      "sandbox-1",
		boxId:          &boxId,
		telemetryLayer: "box",
		organizationId: &organizationId,
		regionId:       &regionId,
	}

	labels := s.telemetryLabels()

	expected := map[string]string{
		"boxlite.layer":      "box",
		"boxlite.sandbox_id": "sandbox-1",
		"boxlite.box_id":     "box-1",
		"boxlite.org_id":     "org-1",
		"boxlite.region_id":  "iad",
	}

	for key, value := range expected {
		if labels[key] != value {
			t.Fatalf("expected %s=%q, got %q", key, value, labels[key])
		}
	}
	if _, ok := labels["boxlite_organization_id"]; ok {
		t.Fatalf("underscore resource labels should not be emitted")
	}
}

func TestTelemetryLabelsFallBackToSandboxIdForBoxId(t *testing.T) {
	s := &server{SandboxId: "sandbox-1"}

	labels := s.telemetryLabels()

	if labels["boxlite.layer"] != "box" {
		t.Fatalf("expected default box layer, got %q", labels["boxlite.layer"])
	}
	if labels["boxlite.box_id"] != "sandbox-1" {
		t.Fatalf("expected box id fallback, got %q", labels["boxlite.box_id"])
	}
}
