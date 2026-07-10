# Billing V3 End-to-End Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the existing Box lifecycle -> Usage -> Rating -> Wallet -> Billing UI chain locally observable and correct, while preserving clear PR boundaries for payment, enforcement, and Admin follow-ups.

**Architecture:** Keep Box and Usage in one transaction. Rating and Wallet remain idempotent downstream ledgers. Customer UI reads persisted Billing APIs and must expose unavailable data instead of substituting zero. Local verification combines focused tests with one full-stack smoke flow.

**Tech Stack:** NestJS, TypeORM/Postgres, React, TanStack Query, Jest/Vitest, Node local-E2E scripts, BoxLite infra-local.

---

## Execution Status

| Work | Status | Evidence |
|---|---|---|
| Tasks 1-4: runtime, TypeORM, Billing config, unavailable UI | Complete | Focused tests, live `/api/config`, cold browser load |
| Settlement correctness | Complete | Ordered one-minute sweep, five-minute slices, sub-cent carry migration/tests |
| Task 5: create/details cost disclosure | Pending | Needs real Pricing read API before replacing the current placeholder safely |
| Task 6: deterministic chain test | Complete as local E2E | `yarn e2e:billing-local` covers DB cron, API, Dex, desktop/mobile UI, cleanup |
| Task 7: local stack | Partial | Billing E2E passes; borrowed L1 Postgres can still wedge while its port stays open |
| Task 8: verification/handoff | Complete for the current accounting stage | API/Dashboard builds, focused tests, lint, browser desktop/mobile |

The next implementation batch is Customer Billing completeness: real date ranges/time series, real run count and quota usage, CreateBox/BoxDetails cost, then Payment/Receipts. It should not be mixed into the accounting fixes above.

---

### Task 1: Repair available-region queries after quota removal

**Files:**
- Create: `apps/api/src/organization/services/organization.service.regions.spec.ts`
- Modify: `apps/api/src/organization/services/organization.service.ts:204`

**Step 1: Write the failing test**

Instantiate `OrganizationService` with a query-builder fake that throws when an `orWhere` clause references the deleted `region_quota` table. Call `listAvailableRegions()` and assert custom regions and shared/dedicated regions with `enforceQuotas=false` remain queryable.

**Step 2: Run the focused test and verify RED**

Run: `cd apps && yarn nx test api --testPathPatterns=organization.service.regions.spec.ts --runInBand`

Expected: FAIL because current SQL still contains `EXISTS (SELECT 1 FROM region_quota ...)`.

**Step 3: Implement the minimal fix**

Remove the stale quota-table branch and update the method comment to reflect the current no-region-quota model. Do not restore a partial quota table in this prerequisite PR.

**Step 4: Run focused test and verify GREEN**

Run the command from Step 2. Expected: PASS.

**Step 5: Commit boundary**

Commit with the PR0 runtime prerequisite changes after Tasks 1-2 are green.

### Task 2: Fix every paginated TypeORM order-path sibling

**Files:**
- Create: `apps/api/src/box/managers/box.manager.spec.ts`
- Modify: `apps/api/src/box/managers/box.manager.ts:176`
- Modify: `apps/api/src/billing/wallet.service.spec.ts`
- Modify: `apps/api/src/billing/wallet.service.ts:434`

**Step 1: Write failing BoxManager test**

Use a query-builder fake that records `orderBy`. Run `autoDeleteCheck()` with one ready runner and assert it uses metadata-safe `activity.lastActivityAt`.

**Step 2: Verify BoxManager RED**

Run: `cd apps && yarn nx test api --testPathPatterns=box.manager.spec.ts --runInBand`

Expected: FAIL with the current quoted path `activity."lastActivityAt"`.

**Step 3: Write failing Wallet test**

Extend `FakeRatedPeriodRepository` to record the `orderBy` value. Call `debitRatedPeriods()` and assert `rp.ratedAt` is used.

**Step 4: Verify Wallet RED**

Run: `cd apps && yarn nx test api --testPathPatterns=wallet.service.spec.ts --runInBand`

Expected: FAIL with `rp."ratedAt"`.

**Step 5: Implement the minimal fixes**

Replace quoted TypeORM property paths with `activity.lastActivityAt` and `rp.ratedAt`. Keep quoted database identifiers only in raw join/where SQL.

**Step 6: Verify GREEN**

Run both focused test commands. Expected: PASS and no `databaseName` scheduler exception in local logs after restart.

### Task 3: Seed Billing configuration for infra-local

**Files:**
- Modify: `apps/infra-local/api.env`
- Modify: `apps/infra-local/compose/native.py:481`
- Create: `apps/infra-local/compose/test_native_billing_env.py`

**Step 1: Write the failing test**

Create a temporary API dotenv file, call `_seed_api_env`, and assert `BILLING_API_URL=http://localhost:<PORT_API>/api` is present and idempotent.

**Step 2: Verify RED**

Run: `cd apps/infra-local && ../../.venv-infra/bin/python -m unittest compose.test_native_billing_env`

Expected: FAIL because `_seed_api_env` does not set the Billing URL.

**Step 3: Implement local-only configuration**

Add the local value to `api.env` and set it idempotently beside `PORT`/`APP_URL` in `_seed_api_env`.

**Step 4: Verify GREEN**

Run the unittest. Then restart API and assert `curl http://localhost:3001/api/config` returns `billingApiUrl`.

### Task 4: Make Billing UI distinguish unavailable data from zero

**Files:**
- Modify: `apps/dashboard/src/pages/Billing.test.tsx`
- Modify: `apps/dashboard/src/pages/Billing.tsx`

**Step 1: Write failing UI tests**

Add separate cases for loading, query failure, and a real zero wallet. The failure case must render an unavailable message and must not render `$0.00` as a wallet fact.

**Step 2: Verify RED**

Run: `cd apps && yarn vitest run --config dashboard/vite.config.mts dashboard/src/pages/Billing.test.tsx`

Expected: FAIL because missing wallet data currently falls back to zero.

**Step 3: Implement explicit states**

Render a compact loading state while wallet/usage load, an error state on failed required queries, and the Billing content only when wallet data exists. Keep a real zero balance visible when returned by the API.

**Step 4: Verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 5: Connect PM-required cost disclosure without mock totals

**Files:**
- Modify: `apps/dashboard/src/components/Box/CreateBoxDialog.test.tsx`
- Modify: `apps/dashboard/src/components/Box/CreateBoxDialog.tsx`
- Modify: `apps/dashboard/src/components/boxes/BoxDetails.test.tsx`
- Modify: `apps/dashboard/src/components/boxes/BoxDetails.tsx`
- Modify: `apps/dashboard/src/components/billing/rates.ts`

**Step 1: Write failing create-dialog test**

Assert selected CPU/memory/disk produce the configured hourly estimate and explanatory wall-time/disk-time copy.

**Step 2: Verify RED**

Run: `cd apps && yarn vitest run --config dashboard/vite.config.mts dashboard/src/components/Box/CreateBoxDialog.test.tsx`

Expected: FAIL because the current dialog says Billing is free.

**Step 3: Implement the estimate**

Merge the PM package's estimate component into the current responsive dialog without replacing current image, validation, or mobile behavior.

**Step 4: Write and verify BoxDetails RED**

Add a test that expects the current hourly rate. Do not show a fake accumulated total until a Box-scoped rated API exists.

**Step 5: Implement BoxDetails rate display and verify GREEN**

Run both component test files. Expected: PASS.

### Task 6: Add a deterministic Billing chain test

**Files:**
- Create: `apps/api/src/billing/billing-chain.integration.spec.ts`
- Modify: `apps/package.json`

**Step 1: Write the failing integration test**

Against real TypeORM repositories in a disposable test schema, create an archived period with non-zero cost, invoke `RatingService.rateClosedPeriods()`, invoke `WalletService.debitRatedPeriods()`, then assert:

- one rated row with a price snapshot;
- one usage debit transaction;
- Free balance reduced first;
- rerunning both methods creates no duplicates;
- `WalletService.getOrganizationUsage()` and `getWalletView()` agree with persisted rows.

**Step 2: Verify RED**

Run the focused integration target. Expected: FAIL on the current Wallet query path before the Task 2 fix is applied.

**Step 3: Verify GREEN after Tasks 1-4**

Run the same test twice. Expected: PASS with stable row counts.

### Task 7: Restore and verify the local stack

**Files:**
- Modify: `apps/scripts/metering-local-e2e.mjs` only if lifecycle assertions need correction.
- Create: `apps/scripts/billing-local-e2e.mjs`
- Modify: `apps/package.json`

**Step 1: Recreate stale L1 dependencies**

Restart the reused Postgres L1 box so its clock resynchronizes, restart API, and verify no long-running orphan region queries remain.

**Step 2: Run migrations and health checks**

Run the infra-local migration entry point and assert API/Dashboard/Runner/Proxy/Postgres/Redis health.

**Step 3: Run existing Metering E2E**

Run: `cd apps && yarn e2e:metering-local`

Expected: PASS.

**Step 4: Run Billing E2E**

The script authenticates, inserts a tagged local-only archived usage fixture, waits for or invokes the tested settlement path, checks persisted Rating/Wallet data and Billing API responses, opens `/dashboard/billing`, verifies real balance/cost text, captures a screenshot, and removes its tagged fixture.

Run: `cd apps && yarn e2e:billing-local`

Expected: PASS with one rated row and one debit for the fixture.

### Task 8: Broaden verification and prepare review handoff

**Files:**
- Modify: `/Users/brian/Documents/Obsidian Vault/1-Projects/2026-06-Billing/07-billingV3/01-4个PR计划.md`
- Modify: `/Users/brian/Documents/Obsidian Vault/1-Projects/2026-06-Billing/07-billingV3/02-local-infra测试计划.md`

**Step 1: Run focused application tests**

Run the Usage, Rating, Wallet, Billing controller, Billing UI, Metering UI, CreateBoxDialog, and BoxDetails test files.

**Step 2: Run repository targets**

Run: `make lint:apps`, `make build:apps`, then `make test:apps` if the focused suite is clean.

**Step 3: Run browser verification**

Use the in-app browser to verify Billing and Metering at desktop and mobile widths, including non-overlap and long values.

**Step 4: Update review documentation**

Record exact commit/branch boundaries, PM requirement mapping, tests actually run, residual risks, and items blocked on Brian/PM/Stripe.
