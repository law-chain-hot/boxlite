# Admin Observability E2E Handoff

## Goal

Provide one Admin-only observability path for platform operators and agents:

- Producers: API, runner, EC2 host collector, and box/daemon.
- Transport: OTLP into the BoxLite OTel Collector.
- Storage: ClickHouse `otel_*` tables.
- Consumption: Admin API, Admin UI, and `boxlite admin obs` CLI commands.

Customer observability is intentionally out of scope for this slice.

## Data Contract

Every platform signal must carry `boxlite.layer`:

- `api`: NestJS API process telemetry.
- `runner`: runner process telemetry.
- `ec2_host`: host metrics/logs from the runner EC2 instance.
- `box`: sandbox/box daemon telemetry.

Where available, resources also carry:

- `boxlite.org_id`
- `boxlite.sandbox_id`
- `boxlite.box_id`
- `boxlite.runner_id`
- `boxlite.machine_id`
- `boxlite.region_id`

The runner injects `BOXLITE_AUTH_TOKEN`, `BOXLITE_OTEL_ENDPOINT`, and the
BoxLite scope env vars into the daemon. The daemon initializes telemetry on
startup when an endpoint is present, and `/init` remains available for
re-initialization.

For per-organization export routing, the collector reads the daemon-provided
`sandbox-auth-token` OTLP metadata header and now asks the API for org OTEL
config using the same header, not a token-bearing URL path. The legacy path
route is still present for compatibility, but its not-found error no longer
echoes the token. Collector cache keys are SHA-256 hashes of the sandbox token,
not the raw token.

The Admin UI and CLI read from the same Admin API queries, so E2E automation can assert the same data a human sees.

## ClickHouse Cloud Setup

No ClickHouse Cloud credentials should be committed or exposed to the dashboard bundle.

Required server-side environment:

- Collector write path:
  - `CLICKHOUSE_ENDPOINT`
  - `CLICKHOUSE_DATABASE`
  - `CLICKHOUSE_USERNAME`
  - `CLICKHOUSE_PASSWORD`
  - optional `CLICKHOUSE_TTL`
- API read path:
  - `CLICKHOUSE_HOST`
  - `CLICKHOUSE_PORT`
  - `CLICKHOUSE_DATABASE`
  - `CLICKHOUSE_USERNAME`
  - `CLICKHOUSE_PASSWORD`
  - `CLICKHOUSE_PROTOCOL`
- Producer path:
  - `OTEL_ENABLED=true`
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - optional `OTEL_EXPORTER_OTLP_HEADERS`

ClickHouse Cloud dev status:

- Console org: `BoxLite`.
- Service: `boxlite-dev-observability`.
- Service id: `b5304026-c54d-435c-87f3-2330dc14dcbe`.
- Cloud/region: `GCP`, `Singapore (asia-southeast1)`.
- Size: `Mini 8GB`, one replica.
- Host: `bsl1hwdtm1.asia-southeast1.gcp.clickhouse.cloud`.
- Database: `otel`.
- Access: dev service is reachable over `443`/HTTPS.

Runtime credential model:

- One bootstrap/admin credential created the database, tables, and least-privilege users.
- Collector uses writer credentials with `SELECT`, `INSERT`, `CREATE TABLE`, and `ALTER TABLE` on `otel.*`.
- Admin API uses reader credentials with `SELECT` on `otel.*`.
- Dashboard receives no ClickHouse credentials; it only calls the Admin API.

Cloud-specific exporter notes:

- Local validation against ClickHouse Cloud failed on the native-style Cloud ports in this environment.
- The working path is `https://<cloud-host>:443`.
- The OTel ClickHouse exporter's default compression caused ClickHouse Cloud HTTP decode failures.
- Runtime uses `CLICKHOUSE_COMPRESS=none`.
- Runtime uses `CLICKHOUSE_CREATE_SCHEMA=false`; schema is created by the bootstrap/admin step, not by the long-running collector user.

Use a local, ignored env file for credentials, for example `/tmp/boxlite-clickhouse-cloud.env` or `apps/.env.observability.local`. Do not commit it.

```bash
# Collector write path.
export CLICKHOUSE_ENDPOINT='https://<cloud-host>:443'
export CLICKHOUSE_DATABASE='otel'
export CLICKHOUSE_USERNAME='<service-user>'
export CLICKHOUSE_PASSWORD='<service-password>'
export CLICKHOUSE_COMPRESS='none'
export CLICKHOUSE_CREATE_SCHEMA='false'

# Admin API read path. These stay server-side only.
export CLICKHOUSE_HOST='<cloud-host>'
export CLICKHOUSE_PORT='443'
export CLICKHOUSE_PROTOCOL='https'
export CLICKHOUSE_DATABASE='otel'
export CLICKHOUSE_USERNAME='<service-user>'
export CLICKHOUSE_PASSWORD='<service-password>'
```

## Smoke Verification

After a collector and API point at the same ClickHouse database, run:

```bash
cd apps
BOXLITE_OBS_API_URL=https://dev.boxlite.ai/api \
BOXLITE_OBS_API_KEY=<system-admin-api-key> \
BOXLITE_OBS_OTLP_ENDPOINT=https://<collector-host> \
npm run e2e:observability
```

The smoke test emits synthetic logs, traces, and metrics for all four layers, then verifies:

- Admin status backend is `receiving`.
- `api`, `runner`, `ec2_host`, and `box` each have logs, traces, and metrics marked `receiving`.
- Admin logs include the synthetic run id across all layers.
- Admin traces include the generated trace id and all four spans.
- Admin metrics include `boxlite.observability.smoke.layer.signal`, including one filtered query per layer.
- Metrics responses are split by `metricName` and `boxlite.layer`, so all-layer Admin UI views do not merge API/runner/host/box values into one ambiguous line.

For local validation, use a local collector endpoint and a local API URL:

```bash
cd apps
BOXLITE_OBS_API_URL=http://localhost:3001/api \
BOXLITE_OBS_API_KEY=<local-system-admin-api-key> \
BOXLITE_OBS_OTLP_ENDPOINT=http://localhost:4318 \
npm run e2e:observability
```

The local API must have the normal dashboard bootstrap env in addition to the
observability env when validating the browser UI:

- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `ENVIRONMENT`
- `DASHBOARD_URL`
- `DEFAULT_TEMPLATE`
- `PROXY_TEMPLATE_URL`
- local-only encryption, OIDC, registry, Redis, and ClickHouse env

Local E2E evidence from this branch:

- Local ClickHouse container: `boxlite-task7-clickhouse`, ClickHouse `24.8`, database `otel`.
- Collector: `apps/otel-collector/config.yaml`, OTLP HTTP on `localhost:4318`, writing to local ClickHouse.
- API: `dist/apps/api/main.js` on `localhost:3001`, reading the same local ClickHouse database.
- Smoke command: `BOXLITE_OBS_API_URL=http://localhost:3001/api BOXLITE_OBS_API_KEY=<redacted> BOXLITE_OBS_OTLP_ENDPOINT=http://localhost:4318 BOXLITE_OBS_TIMEOUT_MS=120000 npm run e2e:observability`.
- Smoke result: `ok: true`, run id `obs-smoke-1780678736399`, trace id `4abf46c936f34922545ed42432824d96`, backend `receiving`, log total `4`, span count `4`, metric series `4`, metric layers `api`, `runner`, `ec2_host`, `box`.
- CLI E2E queried the same run through `boxlite admin obs status`, `logs`, `traces`, `trace`, and `metrics` against `localhost:3001/api`.
- CLI result: backend `receiving`, logs `4`, spans `4`, metric layers `api`, `box`, `ec2_host`, `runner`.

ClickHouse Cloud E2E evidence from this branch:

- Collector: local `boxlite-otel-collector` using writer credentials, `CLICKHOUSE_ENDPOINT=https://bsl1hwdtm1.asia-southeast1.gcp.clickhouse.cloud:443`, `CLICKHOUSE_COMPRESS=none`, and `CLICKHOUSE_CREATE_SCHEMA=false`.
- API: local NestJS API on `localhost:3001`, using reader credentials against the same Cloud database.
- Smoke command: `BOXLITE_OBS_API_URL=http://localhost:3001/api BOXLITE_OBS_API_KEY=<redacted> BOXLITE_OBS_OTLP_ENDPOINT=http://localhost:4318 npm run e2e:observability`.
- Smoke result: `ok: true`, run id `obs-smoke-1780723285198`, trace id `64f96e9f1fc4be0bd3ad6ce5162e147b`, backend `receiving`, log total `4`, span count `4`, metric series `4`, metric layers `api`, `runner`, `ec2_host`, `box`.
- Repeat smoke result: `ok: true`, run id `obs-smoke-1780723807645`, trace id `9b3095fc0f2f0068573bd1c3b09566b5`, backend `receiving`, log total `4`, span count `4`, metric series `4`, metric layers `api`, `runner`, `ec2_host`, `box`.
- CLI E2E queried the same run through `go run . admin obs status`, `logs`, `trace`, and `metrics` against `localhost:3001/api`.
- CLI result: backend `receiving`; logs `4`; trace spans `4`; metrics `4` series across `api`, `box`, `ec2_host`, and `runner`.

## Human Verification

Open the Admin dashboard route:

```text
/dashboard/admin/observability
```

System Admin should see:

- backend and per-layer status cards.
- Logs tab with severity, service, message, trace id, and resource attributes.
- Traces tab with trace list and trace detail waterfall/tree.
- Metrics tab with basic time-series rendering.

Non-admin users should receive a System Admin access error and should not see raw telemetry data.

Local browser evidence from this branch:

- Opened `http://localhost:3000/dashboard/admin/observability` through the in-app browser.
- Without System Admin role, the page rendered `System Admin access required.` and did not expose telemetry rows.
- After promoting only the local Dex test user `admin@boxlite.dev` to `role='admin'` in local Postgres, the same route rendered the Observability nav item and page.
- Status cards showed backend `receiving`; API `receiving`; runner, EC2 host, and box `stale` based on the prior synthetic run.
- Logs tab rendered real API log rows from ClickHouse.
- Traces tab rendered trace list rows and trace detail/waterfall entries; the selected trace had 24 span detail rows.
- Metrics tab rendered `boxlite.observability.smoke.layer.signal` split across `api`, `runner`, `ec2_host`, and `box`, plus live API process metrics.

Cloud browser evidence from this branch:

- Opened `http://localhost:3000/dashboard/admin/observability` through the in-app browser.
- Logged in through local Dex as `admin@boxlite.dev`.
- Status cards showed backend `receiving`; API, runner, EC2 host, and box all `receiving`.
- Logs tab rendered the Cloud smoke run `obs-smoke-1780723285198` with 4 rows across API, runner, EC2 host, and box.
- Traces tab rendered trace `64f96e9f1fc4be0bd3ad6ce5162e147b` with 4 spans and a waterfall/tree detail.
- Metrics tab rendered `boxlite.observability.smoke.layer.signal` split across API, runner, EC2 host, and box.

Online dev evidence from this branch:

- Dev URL: `https://dev.boxlite.ai/dashboard/admin/observability`.
- Brian UI verification: completed in the In-App Browser as `brian.luo@polygala.ai` / `Brian Luo`.
- Runtime deployment evidence: online dev serves the branch-added Admin Observability route and API endpoints:
  - UI: `https://dev.boxlite.ai/dashboard/admin/observability`.
  - API: `https://dev.boxlite.ai/api/admin/observability/status`.
  - API response header from `https://dev.boxlite.ai/api/config`: `x-boxlite-api-version: 0.1.0`.
- ECS task-definition confirmation could not be re-read in this session because local AWS CLI credentials were unavailable; the runtime evidence above is the current proof used for dev acceptance.
- Dev API/Admin API is reachable at `https://dev.boxlite.ai/api`.
- Dev runner EC2 `i-0ee6bc569d5a1e9ef` was hot-updated through SSM with branch-built `runner-amd64`.
- Runner binary evidence: `/usr/local/bin/boxlite-runner` sha256 `a01ce9056b53c16958174215c0a38646ab3f589a5b6ffc100ee4eed94ac40b51`.
- Runner service evidence: `boxlite-runner.service` active; startup logs show OTel logs, traces, and metrics enabled.
- EC2 host heartbeat was installed through SSM as `boxlite-host-otel-heartbeat.timer` to provide fresh `ec2_host` logs and traces in addition to hostmetrics.
- Real online telemetry run: `obs-real-1780734096914`.
- Organization: BrianTeam `e470654b-57eb-4036-ba79-2d0d92355115`.
- Sandbox id: `e76a7023-31c2-4a0a-aa57-8b25d5b876c9`.
- Public box id: `5fMfC77vfXgL`.
- Runner id: `8140fdb2-f645-41c4-988f-b8890b43d25e`.
- Box daemon proof: `POST /toolbox/e76a7023-31c2-4a0a-aa57-8b25d5b876c9/toolbox/process/execute` returned exit code `0` and output containing `obs-real-1780734096914-toolbox` and `Linux`.
- REST exec proof: `POST /v1/boxes/e76a7023-31c2-4a0a-aa57-8b25d5b876c9/exec` with `command=sh` and `args=['-lc', ...]` returned execution `acf4484b-c5ad-4093-b2c8-91506886c2cb`; follow-up status was `completed`, exit code `0`.
- Admin API status proof: backend `receiving`; `api`, `runner`, `ec2_host`, and `box` all `receiving`; each layer had logs, traces, and metrics `receiving`.
- Box trace id: `8dc6df49914ab2fffeefcdc4abf2e988`.
- Box trace detail proof: one span named `POST /process/execute`, span id `e8a97b664d22516a`, HTTP status `200`, duration `7283942ns`.
- Box logs proof: Admin API returned `10` log rows for the sandbox; first row body `Incoming request`, service `sandbox-e76a7023-31c2-4a0a-aa57-8b25d5b876c9`, layer `box`.
- Box metrics proof: Admin API returned box metric series including `system.network.io`, `go.goroutine.count`, `go.memory.allocated`, `boxlite.sandbox.filesystem.available`, and `boxlite.sandbox.cpu.limit`.
- EC2 host trace proof: Admin API returned `boxlite.host.heartbeat` traces, for example trace id `4bc0f8e94d204b5eb08df9cf83acb470`.
- EC2 host logs proof: Admin API returned `boxlite host heartbeat` logs with `boxlite.layer=ec2_host` and `boxlite.machine_id=i-0ee6bc569d5a1e9ef`.
- Online negative auth proof: no auth returned `401`; `otel-collector` non-admin service role returned `403`; admin role returned `200`.
- Code-level permission proof: `SystemActionGuard` tests verify `SystemRole.USER` and `otel-collector` are denied on admin-only routes; `AdminObservabilityController` metadata requires `SystemRole.ADMIN`.

Final Brian UI acceptance run:

- Run id: `obs-real-ui-1780735125348`.
- Organization: BrianTeam `e470654b-57eb-4036-ba79-2d0d92355115`.
- Sandbox id: `4123861b-abb4-40fa-aee2-61511626bf9a`.
- Public box id: `bUaftDrHepeh`.
- Runner id: `8140fdb2-f645-41c4-988f-b8890b43d25e`.
- Box trace id: `a4b3686226923e8bbc77ac7c5150ab97`.
- Time range used for final CLI/API checks: `2026-06-06T08:35:00Z` to `2026-06-06T08:46:00Z`.
- API status proof at final check: backend `receiving`; `api`, `runner`, `ec2_host`, and `box` all `receiving`; every layer had logs, traces, and metrics `receiving`.
- API/CLI box proof at final check:
  - Logs: `10` total box log rows, first returned row `Incoming request`, service `sandbox-4123861b-abb4-40fa-aee2-61511626bf9a`, trace id `a4b3686226923e8bbc77ac7c5150ab97`.
  - Traces: `2` box traces, first trace id `a4b3686226923e8bbc77ac7c5150ab97`.
  - Trace detail: `1` span, `POST /process/execute`.
  - Metrics: `18` box metric series, including `go.memory.allocations`, `boxlite.sandbox.filesystem.utilization`, `system.network.io`, and other daemon/host process metrics.
- UI status proof as Brian: status cards showed backend `receiving`; API, Runner, EC2 Host, and Box all `receiving`; each layer showed logs, traces, and metrics `receiving`.
- UI logs proof as Brian: default Logs tab rendered the same online time window with API, Runner, EC2 Host, and Box rows; Box rows included sandbox `4123861b-abb4-40fa-aee2-61511626bf9a` and trace `a4b3686226923e8bbc77ac7c5150ab97`.
- UI traces proof as Brian: after filtering by sandbox `4123861b-abb4-40fa-aee2-61511626bf9a` and box `bUaftDrHepeh`, Traces tab rendered trace `a4b3686226923e8bbc77ac7c5150ab97`; trace detail rendered `POST /process/execute`.
- UI metrics proof as Brian: after the same filters, Metrics tab rendered Box metric series including `go.memory.used`, `process.cpu.time`, `boxlite.sandbox.filesystem.usage`, `system.memory.usage`, `boxlite.sandbox.cpu.limit`, and `system.cpu.time`.
- UI all-layer metrics proof as Brian: after clearing sandbox/box filters, Metrics tab was not empty and rendered all four layer labels: API, Runner, EC2 Host, and Box.
- UI screenshot evidence:
  - `/tmp/boxlite-admin-observability-brian-traces-20260606.png`
  - `/tmp/boxlite-admin-observability-brian-metrics-20260606.png`
  - `/tmp/boxlite-admin-observability-brian-all-layer-metrics-20260606.png`

## Agent Query Path

Agents can query without UI:

```bash
boxlite admin obs status -f json
boxlite admin obs logs --from <rfc3339> --to <rfc3339> --layer box --severity ERROR --severity WARN -f json
boxlite admin obs traces --from <rfc3339> --to <rfc3339> -f json
boxlite admin obs trace <trace-id> --from <rfc3339> --to <rfc3339> -f json
boxlite admin obs metrics --from <rfc3339> --to <rfc3339> --metric-name boxlite.observability.smoke.layer.signal -f json
```

Online dev CLI evidence from this branch:

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
dist/apps/cli/cli admin observability status -f json
```

Result summary: backend `receiving`; `api`, `runner`, `ec2_host`, and `box` all `receiving`, with logs/traces/metrics `receiving`.

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
dist/apps/cli/cli admin observability logs \
  --from 2026-06-06T08:20:00Z \
  --to 2026-06-06T08:30:00Z \
  --layer box \
  --sandbox-id e76a7023-31c2-4a0a-aa57-8b25d5b876c9 \
  --limit 5 \
  -f json
```

Result summary: `5` returned rows; first row had `traceId=8dc6df49914ab2fffeefcdc4abf2e988`, `boxlite.layer=box`, and `boxlite.sandbox_id=e76a7023-31c2-4a0a-aa57-8b25d5b876c9`.

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
dist/apps/cli/cli admin observability traces \
  --from 2026-06-06T08:20:00Z \
  --to 2026-06-06T08:30:00Z \
  --layer box \
  --sandbox-id e76a7023-31c2-4a0a-aa57-8b25d5b876c9 \
  --limit 5 \
  -f json
```

Result summary: `2` returned traces; first trace id `8dc6df49914ab2fffeefcdc4abf2e988`.

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
dist/apps/cli/cli admin observability trace 8dc6df49914ab2fffeefcdc4abf2e988 \
  --from 2026-06-06T08:20:00Z \
  --to 2026-06-06T08:30:00Z \
  --sandbox-id e76a7023-31c2-4a0a-aa57-8b25d5b876c9 \
  -f json
```

Result summary: `1` span, `POST /process/execute`, HTTP status `200`.

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
dist/apps/cli/cli admin observability metrics \
  --from 2026-06-06T08:20:00Z \
  --to 2026-06-06T08:30:00Z \
  --layer box \
  --sandbox-id e76a7023-31c2-4a0a-aa57-8b25d5b876c9 \
  --limit 20 \
  -f json
```

Result summary: `18` box metric series; sample metrics include `process.cpu.time`, `boxlite.sandbox.cpu.limit`, `system.memory.utilization`, `boxlite.sandbox.filesystem.available`, and `go.goroutine.count`.

Final CLI evidence for Brian UI acceptance run:

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
apps/dist/apps/cli/cli admin observability status -f json
```

Result summary: backend `receiving`; `api`, `runner`, `ec2_host`, and `box` all `receiving`, with logs/traces/metrics `receiving`.

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
apps/dist/apps/cli/cli admin observability logs \
  --from 2026-06-06T08:35:00Z \
  --to 2026-06-06T08:46:00Z \
  --layer box \
  --sandbox-id 4123861b-abb4-40fa-aee2-61511626bf9a \
  --box-id bUaftDrHepeh \
  --limit 5 \
  -f json
```

Result summary: `10` total rows; first returned row had trace id `a4b3686226923e8bbc77ac7c5150ab97`, layer `box`, sandbox id `4123861b-abb4-40fa-aee2-61511626bf9a`, and box id `bUaftDrHepeh`.

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
apps/dist/apps/cli/cli admin observability traces \
  --from 2026-06-06T08:35:00Z \
  --to 2026-06-06T08:46:00Z \
  --layer box \
  --sandbox-id 4123861b-abb4-40fa-aee2-61511626bf9a \
  --box-id bUaftDrHepeh \
  --limit 5 \
  -f json
```

Result summary: `2` traces; first trace id `a4b3686226923e8bbc77ac7c5150ab97`.

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
apps/dist/apps/cli/cli admin observability trace a4b3686226923e8bbc77ac7c5150ab97 \
  --from 2026-06-06T08:35:00Z \
  --to 2026-06-06T08:46:00Z \
  --layer box \
  --sandbox-id 4123861b-abb4-40fa-aee2-61511626bf9a \
  --box-id bUaftDrHepeh \
  -f json
```

Result summary: `1` span, `POST /process/execute`.

```bash
BOXLITE_API_URL=https://dev.boxlite.ai/api \
BOXLITE_API_KEY=<redacted-system-admin-key> \
apps/dist/apps/cli/cli admin observability metrics \
  --from 2026-06-06T08:35:00Z \
  --to 2026-06-06T08:46:00Z \
  --layer box \
  --sandbox-id 4123861b-abb4-40fa-aee2-61511626bf9a \
  --box-id bUaftDrHepeh \
  --limit 20 \
  -f json
```

Result summary: `18` box metric series.

## Dev Acceptance Status

Online dev API/UI/CLI E2E is proven for:

```text
dev API/Runner/EC2 Host/Box/Daemon -> dev OTel Collector -> ClickHouse Cloud -> dev Admin API -> dev Admin UI/CLI
```

Productionization after dev acceptance:

- Replace the dev runner SSM hot update with the normal release/deploy path.
- Keep ClickHouse Cloud credentials in the deployment secret manager only.
- Run the schema bootstrap once in a controlled deploy step.
- Deploy the host heartbeat user-data change through SST for future runner replacements.
