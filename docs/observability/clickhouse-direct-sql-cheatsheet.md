# ClickHouse Direct SQL Cheat-Sheet (internal-layer AI agents)

> **Internal layer only.** This is the *fast lane* for simple/ad-hoc telemetry queries:
> an internal agent writes raw SQL against ClickHouse directly. It is **read-only** and
> **cross-org** (full visibility) — never expose this to a customer-facing agent.
>
> **Two lanes, pick by task** (per the observability dual-track decision):
> - **Simple / flexible** ("show me recent traces of X", ad-hoc SQL) → **this CK direct lane**.
> - **Complex cross-source** ("why did this end-to-end flow fail") → **Admin API `/admin/observability/investigate`**
>   (it merges CK + CloudWatch + Postgres + audit + S3; the decisive root cause is often NOT in CK —
>   e.g. create failures live in Postgres audit, schema errors in CloudWatch). See
>   [consuming-observability-admin-and-agent.md](./consuming-observability-admin-and-agent.md).
>
> Grounded in live introspection of the dev ClickHouse (2026-06-08).

## 0. Connection (read-only)

```
URL:   https://if0d98bj6h.ap-southeast-1.aws.clickhouse.cloud:443
User:  boxlite_otel_reader          # grants: SELECT ON otel.* only (no DDL/DML/system)
Pass:  $BOXLITE_CK_READER_PASSWORD  # from env / macOS keychain — NEVER hardcode in code/repo
DB:    otel
```

Run a query (HTTP, raw SQL in the body — do NOT URL-encode the SQL):

```bash
CK_PASS=$(security find-generic-password -a "$USER" -s BOXLITE_CK_READER_PASSWORD -w)
curl -sS -H "X-ClickHouse-User: boxlite_otel_reader" -H "X-ClickHouse-Key: $CK_PASS" \
  "https://if0d98bj6h.ap-southeast-1.aws.clickhouse.cloud:443/" \
  --data-binary "SELECT ServiceName, count() FROM otel.otel_traces WHERE Timestamp > now() - INTERVAL 1 HOUR GROUP BY ServiceName"
```

The credential is read-only on `otel.*` — you cannot break data with it. Treat it as a secret anyway.

## 1. Tables

```
otel_logs                        application + box-daemon logs
otel_traces                      spans (one row per span)
otel_metrics_gauge               gauge metrics (cpu/fs utilization, runtime gauges)
otel_metrics_sum / _histogram / _summary / _exponential_histogram
```

Key columns:

| Table | Columns you'll use |
|---|---|
| `otel_logs` | `Timestamp DateTime64(9)`, `TraceId`, `SpanId`, `SeverityText`, `ServiceName`, `Body`, `ResourceAttributes Map`, `LogAttributes Map` |
| `otel_traces` | `Timestamp`, `TraceId`, `SpanId`, `ParentSpanId`, `SpanName`, `ServiceName`, `SpanAttributes Map`, `ResourceAttributes Map`, `Duration UInt64` (ns), `StatusCode`, `StatusMessage` |
| `otel_metrics_gauge` | `TimeUnix`, `ServiceName`, `MetricName`, `Value`, `Attributes Map`, `ResourceAttributes Map` |

## 2. Layer model (which service = which layer)

```
ServiceName               layer        notes
─────────────────────────────────────────────────────────────
boxlite-api               api          NestJS control plane; drills to the failing SQL
boxlite-runner            runner       runner host process
boxlite-runner-host       ec2_host     EC2 host metrics/logs
sandbox-<sandboxId>       box          the in-box daemon (its OWN service name)
(ResourceAttributes['boxlite.layer'] is set on some rows and overrides the above)
```

## 3. ⚠️ Correlation keys — DOT vs UNDERSCORE (the #1 gotcha)

API / runner spans use **dot**-namespaced keys; the **box daemon uses UNDERSCORE** and is
only findable by its `ServiceName`. If you filter box telemetry by a dot key you get **nothing**.

```
otel_traces SpanAttributes (api/runner):  boxlite.org_id  boxlite.sandbox_id  boxlite.user_id
                                          boxlite.box_id  boxlite.runner_id  boxlite.job_id
                                          boxlite.signal  boxlite.source
ResourceAttributes (api/runner/host):     boxlite.layer  boxlite.machine_id  boxlite.region_id

box daemon (ServiceName = 'sandbox-<id>'): ResourceAttributes['boxlite_organization_id']   ← underscore!
                                           ResourceAttributes['boxlite_region_id']
   → to find a box's OWN logs:  WHERE ServiceName = 'sandbox-<sandboxId>'   (NOT boxlite.sandbox_id)
```

## 4. Recipes (copy-paste, edit the filter)

```sql
-- Recent ERROR spans (what's breaking right now)
SELECT ServiceName, SpanName, substr(StatusMessage,1,80) err, count() c
FROM otel.otel_traces
WHERE Timestamp > now() - INTERVAL 1 HOUR AND StatusCode = 'Error'
GROUP BY ServiceName, SpanName, err ORDER BY c DESC LIMIT 20;

-- All spans of ONE trace (waterfall), ordered
SELECT Timestamp, ServiceName, SpanName, round(Duration/1e6,2) ms, StatusCode, StatusMessage
FROM otel.otel_traces WHERE TraceId = '<traceId>' ORDER BY Timestamp;

-- Traces for an ORG in a window
SELECT TraceId, ServiceName, SpanName, StatusCode
FROM otel.otel_traces
WHERE Timestamp > now() - INTERVAL 2 HOUR
  AND SpanAttributes['boxlite.org_id'] = '<orgId>' ORDER BY Timestamp DESC LIMIT 50;

-- Spans for a SANDBOX (api/runner side, dot key)
SELECT Timestamp, ServiceName, SpanName, StatusCode, substr(StatusMessage,1,60)
FROM otel.otel_traces
WHERE Timestamp > now() - INTERVAL 2 HOUR
  AND SpanAttributes['boxlite.sandbox_id'] = '<sandboxId>' ORDER BY Timestamp;

-- The BOX's OWN logs (daemon, by service name — underscore world)
SELECT Timestamp, SeverityText, Body
FROM otel.otel_logs
WHERE Timestamp > now() - INTERVAL 6 HOUR
  AND ServiceName = 'sandbox-<sandboxId>' ORDER BY Timestamp;

-- API logs containing a phrase (free-text)
SELECT Timestamp, SeverityText, substr(Body,1,160)
FROM otel.otel_logs
WHERE Timestamp > now() - INTERVAL 1 HOUR
  AND ServiceName = 'boxlite-api' AND positionCaseInsensitive(Body,'<phrase>') > 0
ORDER BY Timestamp DESC LIMIT 50;

-- Box metrics for a sandbox (cpu / filesystem)
SELECT TimeUnix, MetricName, Value
FROM otel.otel_metrics_gauge
WHERE TimeUnix > now() - INTERVAL 2 HOUR
  AND ServiceName = 'sandbox-<sandboxId>'
  AND MetricName LIKE 'boxlite.sandbox.%' ORDER BY TimeUnix;
```

## 5. Honest gaps (don't chase what isn't there)

- **Box `otel_traces` ≈ 0.** The in-box daemon emits logs+metrics but produces almost no spans
  (only per-request server spans after `/init`). Don't expect box-level traces.
- **The "why" is often NOT in CK.** Create/start failures, 4xx rejected at a guard, and app-state
  truth live in **Postgres `audit_log` + CloudWatch**, which this lane CANNOT see. For those, use the
  Admin API investigate (it merges all sources). Empty CK ≠ "nothing happened".
- **Time filters:** always `Timestamp > now() - INTERVAL N HOUR` (or `TimeUnix` for metrics). Without a
  time bound, queries scan everything and are slow.

## 6. When to use which lane

```
Simple / one source / ad-hoc SQL / fast iteration   →  this CK direct lane
Complex / cross-layer / "root cause across services" →  Admin API /admin/observability/investigate
Don't reach for CK direct when the answer is in audit/Postgres/CloudWatch — you'll conclude wrongly.
```
