# Admin Platform Telemetry UX Implementation Plan

**Goal:** Make POL-14 Phase 3 telemetry truthful and useful for admin debugging by keeping platform evidence at platform scope, fixing log filters, making traces inspectable without a second modal, and grouping metrics by operational meaning.

**Architecture:** The dashboard continues to read platform telemetry from the admin-only `/api/admin/telemetry/*` endpoints backed by ClickHouse. Box drawers show only box facts and operations until telemetry carries `sandbox_id`/`runner_id`/`org_id` attributes. UI grouping logic stays in small pure helpers so it can be unit-tested without a browser.

**Tech Stack:** React, TanStack Query, Radix UI primitives, Recharts, Vitest/Jest, NestJS, ClickHouse.

---

### Task 1: Scope Guardrails

**Files:**
- Modify: `apps/dashboard/src/components/admin/AdminTelemetryDrawer.tsx`
- Modify: `apps/dashboard/src/pages/admin/AdminBoxTelemetry.tsx`
- Modify: `apps/dashboard/src/pages/Admin.tsx`
- Test: `apps/dashboard/src/components/admin/AdminTelemetryDrawer.spec.tsx`

**Steps:**
1. Update the drawer test to expect no platform telemetry action.
2. Remove the drawer's platform telemetry button and routing imports.
3. Redirect the old `/dashboard/admin/boxes/:boxId` route to the top-level admin platform telemetry view without preserving box context.
4. Let the admin page initialize from `?view=platformTelemetry` so old links land on the truthful top-level view.

### Task 2: Logs Severity Filters

**Files:**
- Modify: `apps/dashboard/src/hooks/telemetryScope.ts`
- Modify: `apps/dashboard/src/components/telemetry/LogsTab.tsx`
- Modify: `apps/api/src/sandbox-telemetry/services/sandbox-telemetry.service.ts`
- Test: `apps/dashboard/src/hooks/telemetryScope.spec.ts`
- Test: `apps/api/src/sandbox-telemetry/services/sandbox-telemetry.service.spec.ts`

**Steps:**
1. Make query serialization normalize severity filters to lower-case.
2. Make ClickHouse log severity matching case-insensitive with `lower(SeverityText)`.
3. Keep visible labels readable as `DEBUG`, `INFO`, `WARN`, `ERROR`.
4. Make empty states mention the selected level/search instead of a generic "No logs found".

### Task 3: Trace Master-Detail

**Files:**
- Create: `apps/dashboard/src/components/telemetry/traceWaterfall.ts`
- Create: `apps/dashboard/src/components/telemetry/traceWaterfall.spec.ts`
- Modify: `apps/dashboard/src/components/telemetry/TracesTab.tsx`

**Steps:**
1. Add pure helpers to build ordered waterfall rows and resolve the selected trace.
2. Default-select the first trace when trace data loads.
3. Render trace list and waterfall side by side on desktop, stacked on small screens.
4. Show span attributes via explicit expandable rows rather than hover-only content.

### Task 4: Metrics Operational Grouping

**Files:**
- Create: `apps/dashboard/src/components/telemetry/platformMetrics.ts`
- Create: `apps/dashboard/src/components/telemetry/platformMetrics.spec.ts`
- Modify: `apps/dashboard/src/components/telemetry/MetricsTab.tsx`

**Steps:**
1. Group metrics into Runtime saturation, Memory pressure, Dependency health, Background jobs, and Other metrics.
2. Put the watch-first groups first and attach short descriptions.
3. Use display names instead of raw metric names in legends/tooltips where possible.
4. Keep raw metric names visible in chart labels/tooltips enough for debugging.

### Task 5: Verification and Deploy

**Commands:**
- `make fmt:apps`
- `make lint:apps`
- `make test:apps`
- `make build:apps`
- Browser E2E on local/dev:
  - platform telemetry tab loads
  - logs `INFO`/`ERROR` filters return data when present
  - traces show a waterfall without opening a sheet
  - metrics show operational groups
  - box drawer has no platform telemetry button
- Docker build API image and deploy dev ECS Api service.
