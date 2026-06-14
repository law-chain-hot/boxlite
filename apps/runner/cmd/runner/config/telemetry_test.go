// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package config

import "testing"

func TestTelemetryLabelsIncludeRunnerScope(t *testing.T) {
	cfg := &Config{
		RunnerId:    "runner-1",
		MachineId:   "i-123",
		AWSRegion:   "us-east-1",
		Environment: "dev",
	}

	labels := cfg.GetTelemetryLabels("runner")

	if labels["boxlite.layer"] != "runner" {
		t.Fatalf("expected runner layer, got %q", labels["boxlite.layer"])
	}
	if labels["boxlite.runner_id"] != "runner-1" {
		t.Fatalf("expected runner id label, got %q", labels["boxlite.runner_id"])
	}
	if labels["boxlite.machine_id"] != "i-123" {
		t.Fatalf("expected machine id label, got %q", labels["boxlite.machine_id"])
	}
	if labels["boxlite.region_id"] != "us-east-1" {
		t.Fatalf("expected region id label, got %q", labels["boxlite.region_id"])
	}
	if _, ok := labels["deployment.environment"]; ok {
		t.Fatalf("deployment environment belongs to OTel semantic resource attributes, not boxlite labels")
	}
}
