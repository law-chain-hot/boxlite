# POL-14 Phase 3 Review Hardening Plan

**Goal:** Harden the POL-14 Phase 3 admin observability branch with review-driven tests, security bounds, and handoff documentation.

**Architecture:** Keep Phase 3 ClickHouse-first and platform-scoped. Admin telemetry remains behind system-admin guards and uses ClickHouse data for `ServiceName = 'boxlite-api'`; Jaeger remains deferred to Phase 3.1.

**Tech Stack:** NestJS, class-validator, ClickHouse, OpenTelemetry Collector, React Query, Vitest/Jest, SST.

---

### Task 1: Harden Telemetry Query DTOs

**Files:**
- Modify: `apps/api/src/sandbox-telemetry/dto/telemetry-query-params.dto.ts`
- Test: `apps/api/src/sandbox-telemetry/dto/telemetry-query-params.dto.spec.ts`

**Steps:**
1. Replace ad hoc `page` and `limit` decorators with shared `PageNumber` and `PageLimit` decorators.
2. Normalize array query params with `ToArray`.
3. Add bounded limits for filter list length, filter value length, and log search length.
4. Add DTO tests that prove defaults, page-size cap, single-value array normalization, and oversize rejection.

**Verification:**
- `cd apps && yarn nx test api --testFile=src/sandbox-telemetry/dto/telemetry-query-params.dto.spec.ts`

### Task 2: Lock Module Dependency Boundary

**Files:**
- Modify: `apps/api/src/sandbox-telemetry/sandbox-telemetry.module.ts`
- Test: `apps/api/src/sandbox-telemetry/sandbox-telemetry.module.spec.ts`

**Steps:**
1. Import `ClickHouseModule` where `SandboxTelemetryService` is declared.
2. Add a metadata test so the dependency boundary does not regress.

**Verification:**
- `cd apps && yarn nx test api --testFile=src/sandbox-telemetry/sandbox-telemetry.module.spec.ts`

### Task 3: Document Phase 3 Scope and Review Decisions

**Files:**
- Create: `docs/architecture/admin-observability.md`
- Modify: `docs/architecture/README.md`
- Modify: `apps/infra/README.md`

**Steps:**
1. Document the platform-only telemetry scope and ClickHouse data flow.
2. Document admin-only routes and guard expectations.
3. Document that Jaeger is provisioned but intentionally not wired or linked in Phase 3.
4. Update the infra service table so it no longer implies Jaeger is the supported Phase 3 trace viewer.

**Verification:**
- `make fmt:check`

### Task 4: Full Branch Verification

**Commands:**
- `make fmt:check`
- `make lint:apps`
- `make test:apps`
- `make build:apps`
- `CHANGE_BASE_REF=origin/main make test`

**Browser Check:**
- In dev, verify Admin Platform telemetry still renders logs, traces, metrics, and trace details.
- Confirm no `Open Jaeger` link is visible in Phase 3.

### Task 5: Commit and Push

**Commands:**
- `git status -sb`
- `git add ...`
- `git commit -m "test(admin): harden telemetry review coverage"`
- `git push fork codex/pol14-phase3-admin-observability`
