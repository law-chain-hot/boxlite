// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/boxlite-ai/boxlite/cli/apiclient"
	cliauth "github.com/boxlite-ai/boxlite/cli/auth"
	"github.com/boxlite-ai/boxlite/cli/cmd/common"
	"github.com/boxlite-ai/boxlite/cli/config"
	"github.com/spf13/cobra"
)

var (
	obsFrom        string
	obsTo          string
	obsLayer       string
	obsServiceName string
	obsOrgId       string
	obsSandboxId   string
	obsBoxId       string
	obsRunnerId    string
	obsMachineId   string
	obsTraceId     string
	obsRequestId   string
	obsOperationId string
	obsExecutionId string
	obsJobId       string
	obsSeverities  []string
	obsSearch      string
	obsMetricNames []string
	obsPage        int
	obsLimit       int
)

var ObservabilityCmd = &cobra.Command{
	Use:     "observability",
	Short:   "Inspect platform observability data",
	Aliases: []string{"obs"},
}

var observabilityStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show observability backend and layer status",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return adminGetAndPrint(cmd.Context(), "/admin/observability/status", nil)
	},
}

var observabilityLogsCmd = &cobra.Command{
	Use:   "logs",
	Short: "Query admin observability logs",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return adminGetAndPrint(cmd.Context(), "/admin/observability/logs", logsObservabilityQuery())
	},
}

var observabilityTracesCmd = &cobra.Command{
	Use:   "traces",
	Short: "Query admin observability trace summaries",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return adminGetAndPrint(cmd.Context(), "/admin/observability/traces", commonObservabilityQuery())
	},
}

var observabilityTraceCmd = &cobra.Command{
	Use:   "trace <trace-id>",
	Short: "Query spans for one trace",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return adminGetAndPrint(cmd.Context(), "/admin/observability/traces/"+url.PathEscape(args[0]), commonObservabilityQuery())
	},
}

var observabilityMetricsCmd = &cobra.Command{
	Use:   "metrics",
	Short: "Query admin observability metrics",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		values := commonObservabilityQuery()
		for _, metricName := range obsMetricNames {
			addIfSet(values, "metricNames", metricName)
		}
		return adminGetAndPrint(cmd.Context(), "/admin/observability/metrics", values)
	},
}

var observabilityInvestigateCmd = &cobra.Command{
	Use:   "investigate",
	Short: "Query related telemetry, platform state, and audit evidence",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return adminGetAndPrint(cmd.Context(), "/admin/observability/investigate", investigateObservabilityQuery())
	},
}

func init() {
	ObservabilityCmd.AddCommand(
		observabilityStatusCmd,
		observabilityLogsCmd,
		observabilityTracesCmd,
		observabilityTraceCmd,
		observabilityMetricsCmd,
		observabilityInvestigateCmd,
	)

	common.RegisterFormatFlag(observabilityStatusCmd)
	registerObservabilityQueryFlags(observabilityLogsCmd)
	registerObservabilityQueryFlags(observabilityTracesCmd)
	registerObservabilityQueryFlags(observabilityTraceCmd)
	registerObservabilityQueryFlags(observabilityMetricsCmd)
	registerObservabilityQueryFlags(observabilityInvestigateCmd)
	observabilityLogsCmd.Flags().StringArrayVar(&obsSeverities, "severity", nil, "Filter logs by severity text, can be repeated")
	observabilityLogsCmd.Flags().StringVar(&obsSearch, "search", "", "Filter logs by body text")
	observabilityMetricsCmd.Flags().StringArrayVar(&obsMetricNames, "metric-name", nil, "Metric name filter, can be repeated")
	registerObservabilityCorrelationFlags(observabilityInvestigateCmd)
}

func registerObservabilityQueryFlags(cmd *cobra.Command) {
	now := time.Now().UTC()
	defaultFrom := now.Add(-1 * time.Hour).Format(time.RFC3339)
	defaultTo := now.Format(time.RFC3339)

	cmd.Flags().StringVar(&obsFrom, "from", defaultFrom, "Start time, RFC3339")
	cmd.Flags().StringVar(&obsTo, "to", defaultTo, "End time, RFC3339")
	cmd.Flags().StringVar(&obsLayer, "layer", "", "Layer filter: api, runner, ec2_host, box")
	cmd.Flags().StringVar(&obsServiceName, "service-name", "", "OTel service.name filter")
	cmd.Flags().StringVar(&obsOrgId, "org-id", "", "Organization id filter")
	cmd.Flags().StringVar(&obsSandboxId, "sandbox-id", "", "Sandbox id filter")
	cmd.Flags().StringVar(&obsBoxId, "box-id", "", "Box id filter")
	cmd.Flags().StringVar(&obsRunnerId, "runner-id", "", "Runner id filter")
	cmd.Flags().StringVar(&obsMachineId, "machine-id", "", "Machine id filter")
	cmd.Flags().IntVar(&obsPage, "page", 1, "Page number")
	cmd.Flags().IntVar(&obsLimit, "limit", 100, "Maximum result count")
	common.RegisterFormatFlag(cmd)
}

func registerObservabilityCorrelationFlags(cmd *cobra.Command) {
	cmd.Flags().StringVar(&obsTraceId, "trace-id", "", "Trace id filter")
	cmd.Flags().StringVar(&obsRequestId, "request-id", "", "Request id filter")
	cmd.Flags().StringVar(&obsOperationId, "operation-id", "", "Operation id filter")
	cmd.Flags().StringVar(&obsExecutionId, "execution-id", "", "Execution id filter")
	cmd.Flags().StringVar(&obsJobId, "job-id", "", "Job id filter")
}

func commonObservabilityQuery() url.Values {
	values := url.Values{}
	values.Set("from", obsFrom)
	values.Set("to", obsTo)
	values.Set("page", fmt.Sprintf("%d", obsPage))
	values.Set("limit", fmt.Sprintf("%d", obsLimit))
	addIfSet(values, "layer", obsLayer)
	addIfSet(values, "serviceName", obsServiceName)
	addIfSet(values, "orgId", obsOrgId)
	addIfSet(values, "sandboxId", obsSandboxId)
	addIfSet(values, "boxId", obsBoxId)
	addIfSet(values, "runnerId", obsRunnerId)
	addIfSet(values, "machineId", obsMachineId)
	return values
}

func logsObservabilityQuery() url.Values {
	values := commonObservabilityQuery()
	for _, severity := range obsSeverities {
		addIfSet(values, "severities", severity)
	}
	addIfSet(values, "search", obsSearch)
	return values
}

func investigateObservabilityQuery() url.Values {
	values := commonObservabilityQuery()
	addIfSet(values, "traceId", obsTraceId)
	addIfSet(values, "requestId", obsRequestId)
	addIfSet(values, "operationId", obsOperationId)
	addIfSet(values, "executionId", obsExecutionId)
	addIfSet(values, "jobId", obsJobId)
	return values
}

func adminGetAndPrint(ctx context.Context, path string, values url.Values) error {
	body, err := adminGet(ctx, path, values)
	if err != nil {
		return err
	}
	return printResponse(body)
}

func adminGet(ctx context.Context, path string, values url.Values) ([]byte, error) {
	if err := cliauth.RefreshTokenIfNeeded(ctx); err != nil {
		return nil, err
	}

	c, err := config.GetConfig()
	if err != nil {
		return nil, err
	}
	activeProfile, err := c.GetActiveProfile()
	if err != nil {
		return nil, err
	}

	endpoint := strings.TrimRight(activeProfile.Api.Url, "/") + path
	if len(values) > 0 {
		endpoint += "?" + values.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set(apiclient.BoxliteSourceHeader, "cli")
	req.Header.Set(apiclient.API_VERSION_HEADER, "2")

	switch {
	case activeProfile.Api.Key != nil:
		req.Header.Set("Authorization", "Bearer "+*activeProfile.Api.Key)
	case activeProfile.Api.Token != nil:
		req.Header.Set("Authorization", "Bearer "+activeProfile.Api.Token.AccessToken)
	default:
		return nil, fmt.Errorf("no valid token found, use 'boxlite login' to authenticate")
	}
	if activeProfile.ActiveOrganizationId != nil {
		req.Header.Set("X-BoxLite-Organization-ID", *activeProfile.ActiveOrganizationId)
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, apiclient.HandleErrorResponse(res, fmt.Errorf("admin observability request failed"))
	}
	defer res.Body.Close()

	return io.ReadAll(res.Body)
}

func printResponse(body []byte) error {
	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		fmt.Println(string(body))
		return nil
	}

	if common.FormatFlag != "" {
		common.NewFormatter(payload).Print()
		return nil
	}

	out, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(out))
	return nil
}

func addIfSet(values url.Values, key string, value string) {
	if strings.TrimSpace(value) != "" {
		values.Add(key, value)
	}
}
