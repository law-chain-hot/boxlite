# Admin Platform Telemetry Scope Design

## Goal

Make the admin console honest about telemetry scope: current logs, traces, and metrics are platform evidence for `boxlite-api`, not per-box runtime telemetry.

## Design

- Add `Platform Telemetry` as a top-level admin view.
- Keep `Overview`, `People & Boxes`, and `Fleet` as operational state views.
- Remove embedded telemetry tabs from the box drawer. The drawer shows only box facts and actions.
- Keep the full-page box telemetry route as a contextual platform telemetry page: it can say which box opened it, but the evidence remains global platform telemetry.

## Data Flow

- Admin state views use `/api/admin/overview/*` and business database state.
- Platform telemetry uses `/api/admin/telemetry/*` and ClickHouse OTEL tables.
- The UI does not present `boxlite-api` telemetry as sandbox runtime telemetry.

## Deferred Work

- Add `errorReason` or equivalent failure cause to admin boxes.
- Add `sandbox_id`, `runner_id`, and `org_id` attributes to control-plane logs/traces.
- Add real per-box runtime telemetry only after daemon/workload emission, storage, access control, and cost boundaries are designed.
