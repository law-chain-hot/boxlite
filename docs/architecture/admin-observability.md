# Admin Platform Observability

POL-14 Phase 3 exposes platform telemetry to system administrators. The admin panel is intentionally
platform-scoped: it shows the `boxlite-api` service's logs, traces, and Node runtime metrics. It does
not claim to show per-Box daemon telemetry or user-program telemetry.

## Data Flow

```
boxlite-api OTLP
  -> OtelCollector :4318
  -> ClickHouse database otel (SST self-hosted by default, ClickHouse Cloud via CLICKHOUSE_MODE=cloud)
  -> Admin dashboard Platform telemetry panel
```

The ClickHouse tables used by the panel are:

- `otel_logs`
- `otel_traces`
- `otel_metrics_gauge`
- `otel_metrics_sum`
- `otel_metrics_histogram`

The admin telemetry panel queries the API through admin-only routes:

- `GET /api/admin/telemetry/logs`
- `GET /api/admin/telemetry/traces`
- `GET /api/admin/telemetry/traces/:traceId`
- `GET /api/admin/telemetry/metrics`

These routes use `CombinedAuthGuard`, `SystemActionGuard`, and `RequiredApiRole([ADMIN])`. They do not
use `SandboxAccessGuard`, because the data is platform-wide and identical regardless of which Box row
the admin used to open the panel.

## Query Scope

`SandboxTelemetryService` hard-pins platform telemetry to `ServiceName = 'boxlite-api'`. The existing
user-facing sandbox telemetry routes remain in place for future per-sandbox telemetry, but Phase 3
Plan B does not emit inside-microVM telemetry.

Metrics preserve the existing dashboard response shape. Gauges and sums are averaged into one-minute
points. Histograms are represented as per-minute means using `sum(Sum) / nullIf(sum(Count), 0)`.

## ClickHouse Deployment

Development and staging can use the SST-managed ClickHouse ECS service. For a managed provider such
as ClickHouse Cloud, set `CLICKHOUSE_MODE=cloud` and pass the provider's API query endpoint plus the
collector write endpoint through env vars. The dashboard and API contracts do not change; only the
storage endpoint behind the API/collector changes.

## Jaeger

Jaeger remains provisioned for a future Phase 3.1 integration, but Phase 3 does not wire collector
pipelines to Jaeger and does not expose an `Open Jaeger` button. The supported trace inspection path is
the in-panel trace waterfall backed by ClickHouse.

Before re-enabling Jaeger links, implement and verify all of the following:

- collector trace export to Jaeger without retry/drop logs
- a supported `/jaeger` proxy or a documented standalone URL
- trace links using the `boxlite-api` service name
- browser validation that linked traces contain the same spans as the in-panel waterfall

## Operational Checks

For dev validation, check the current ECS tasks rather than historical streams:

- `OtelCollector` should run the collector config without runtime `otlphttp/jaeger` overrides.
- `OtelCollector` logs should not contain recurring `otlphttp/jaeger` or `dropped_items` messages.
- `Api` logs should not contain recurring TypeORM `databaseName` or
  `distinctAlias.activity_lastActivityAt` lifecycle-query errors.
- The admin dashboard should return 200 for Platform telemetry on own-org and cross-org Box rows.
