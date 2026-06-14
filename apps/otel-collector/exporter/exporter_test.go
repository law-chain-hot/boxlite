// Copyright BoxLite AI (originally Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package exporter

import (
	"context"
	"testing"

	"go.opentelemetry.io/collector/pdata/pmetric"
	"go.uber.org/zap"
)

func TestExporterSkipsPerOrganizationRouteWithoutSandboxToken(t *testing.T) {
	exp := &Exporter[pmetric.Metrics]{
		config: &Config{SandboxAuthTokenHeader: "sandbox-auth-token"},
		logger: zap.NewNop(),
	}

	if err := exp.push(context.Background(), pmetric.NewMetrics()); err != nil {
		t.Fatalf("expected telemetry without sandbox token to be skipped, got error: %v", err)
	}
}
