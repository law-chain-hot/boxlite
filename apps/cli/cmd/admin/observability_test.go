// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package admin

import "testing"

func TestLogsObservabilityQuerySerializesScopeAndRepeatedSeverities(t *testing.T) {
	resetObservabilityTestFlags(t)

	obsFrom = "2026-06-05T10:00:00Z"
	obsTo = "2026-06-05T11:00:00Z"
	obsLayer = "box"
	obsServiceName = "sandbox-observability-smoke"
	obsOrgId = "org-1"
	obsSandboxId = "sandbox-1"
	obsBoxId = "box-1"
	obsRunnerId = "runner-1"
	obsMachineId = "machine-1"
	obsPage = 2
	obsLimit = 25
	obsSeverities = []string{"ERROR", "WARN", " "}
	obsSearch = "timeout"

	values := logsObservabilityQuery()

	if values.Get("from") != obsFrom {
		t.Fatalf("expected from %q, got %q", obsFrom, values.Get("from"))
	}
	if values.Get("to") != obsTo {
		t.Fatalf("expected to %q, got %q", obsTo, values.Get("to"))
	}
	if values.Get("layer") != obsLayer {
		t.Fatalf("expected layer %q, got %q", obsLayer, values.Get("layer"))
	}
	if values.Get("machineId") != obsMachineId {
		t.Fatalf("expected machineId %q, got %q", obsMachineId, values.Get("machineId"))
	}
	if got := values["severities"]; len(got) != 2 || got[0] != "ERROR" || got[1] != "WARN" {
		t.Fatalf("expected repeated severities ERROR/WARN, got %#v", got)
	}
	if values.Get("severity") != "" {
		t.Fatalf("did not expect legacy severity query param, got %q", values.Get("severity"))
	}
	if values.Get("search") != obsSearch {
		t.Fatalf("expected search %q, got %q", obsSearch, values.Get("search"))
	}
}

func TestInvestigateObservabilityQuerySerializesCorrelationIds(t *testing.T) {
	resetObservabilityTestFlags(t)

	obsFrom = "2026-06-05T10:00:00Z"
	obsTo = "2026-06-05T11:00:00Z"
	obsTraceId = "trace-1"
	obsRequestId = "req-1"
	obsOperationId = "op-1"
	obsExecutionId = "exec-1"
	obsJobId = "job-1"
	obsBoxId = "box-1"

	values := investigateObservabilityQuery()

	if values.Get("traceId") != obsTraceId {
		t.Fatalf("expected traceId %q, got %q", obsTraceId, values.Get("traceId"))
	}
	if values.Get("requestId") != obsRequestId {
		t.Fatalf("expected requestId %q, got %q", obsRequestId, values.Get("requestId"))
	}
	if values.Get("operationId") != obsOperationId {
		t.Fatalf("expected operationId %q, got %q", obsOperationId, values.Get("operationId"))
	}
	if values.Get("executionId") != obsExecutionId {
		t.Fatalf("expected executionId %q, got %q", obsExecutionId, values.Get("executionId"))
	}
	if values.Get("jobId") != obsJobId {
		t.Fatalf("expected jobId %q, got %q", obsJobId, values.Get("jobId"))
	}
	if values.Get("boxId") != obsBoxId {
		t.Fatalf("expected boxId %q, got %q", obsBoxId, values.Get("boxId"))
	}
}

func resetObservabilityTestFlags(t *testing.T) {
	t.Helper()

	previous := struct {
		from        string
		to          string
		layer       string
		serviceName string
		orgId       string
		sandboxId   string
		boxId       string
		runnerId    string
		machineId   string
		traceId     string
		requestId   string
		operationId string
		executionId string
		jobId       string
		severities  []string
		search      string
		metricNames []string
		page        int
		limit       int
	}{
		from:        obsFrom,
		to:          obsTo,
		layer:       obsLayer,
		serviceName: obsServiceName,
		orgId:       obsOrgId,
		sandboxId:   obsSandboxId,
		boxId:       obsBoxId,
		runnerId:    obsRunnerId,
		machineId:   obsMachineId,
		traceId:     obsTraceId,
		requestId:   obsRequestId,
		operationId: obsOperationId,
		executionId: obsExecutionId,
		jobId:       obsJobId,
		severities:  obsSeverities,
		search:      obsSearch,
		metricNames: obsMetricNames,
		page:        obsPage,
		limit:       obsLimit,
	}

	t.Cleanup(func() {
		obsFrom = previous.from
		obsTo = previous.to
		obsLayer = previous.layer
		obsServiceName = previous.serviceName
		obsOrgId = previous.orgId
		obsSandboxId = previous.sandboxId
		obsBoxId = previous.boxId
		obsRunnerId = previous.runnerId
		obsMachineId = previous.machineId
		obsTraceId = previous.traceId
		obsRequestId = previous.requestId
		obsOperationId = previous.operationId
		obsExecutionId = previous.executionId
		obsJobId = previous.jobId
		obsSeverities = previous.severities
		obsSearch = previous.search
		obsMetricNames = previous.metricNames
		obsPage = previous.page
		obsLimit = previous.limit
	})
}
