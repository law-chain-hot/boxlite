# Billing V3 End-to-End Design

## Goal

Deliver a reviewable path from Box lifecycle changes to visible customer billing data:

```text
Box state -> usage ledger -> rated usage -> settlement -> wallet ledger -> customer billing UI
```

The first milestone must be locally testable without Stripe. Live payment, destructive enforcement, and finance-facing receipt semantics stay behind explicit product or operator gates.

## Approved Foundations

- Usage is wall-time based: running bills CPU, memory, and disk; stopped bills retained disk only.
- Box state and the current usage period change in one database transaction.
- Rating, wallet deduction, payment, and enforcement remain downstream consumers; they do not join the Box state transaction.
- Money is USD cents with separate free and paid pools. Free balance is spent first.
- Historical rating rows retain immutable price and usage snapshots.
- Rating keeps precise sub-cent amounts. Settlement carries the fraction forward and only debits whole cents, so short periods are not rounded away.
- Redis reduces duplicate cron work but is not the source of billing correctness.

## Approaches Considered

### A. Patch the current four commits only

Fast, but it leaves the PM journeys for payment, enforcement, quotas, per-Box cost, and Admin mixed with placeholders. Rejected because a green page would overstate product completeness.

### B. Layered stack with a runtime prerequisite

Recommended. Each PR owns one source of truth and one failure model. Existing commits remain the base for Usage, Rating, Wallet, and Customer Billing; follow-up work is split by payment, enforcement, and Admin boundaries.

### C. One complete Billing PR

Rejected. It would combine lifecycle correctness, accounting, payment-provider effects, destructive resource control, and UI review in one change.

## PR Stack

| PR | Responsibility | PM mapping | Current status | Can proceed without Brian |
|---|---|---|---|---|
| PR0 Runtime prerequisite | Remove stale `region_quota` query, fix TypeORM order paths, seed Billing URL on up/restart | Enables every local journey | Implemented and tested | Yes |
| PR1 Usage ledger | Box+period transaction, one open period, 5-minute rollover/archive, raw Metering API/UI | Sections 2.3, 5.1, J3/J4 | Implemented and tested | Yes |
| PR2 Rating | Versioned rates, immutable precise snapshots, idempotent rated periods | Section 5.2 | Implemented and tested | Yes |
| PR3 Settlement + Wallet | Ordered rate-then-debit sweep, sub-cent carry, Free/Paid pools, grant, idempotent debit | Sections 2.2, 5.3, 5.4, 7.1 | Implemented and tested | Yes |
| PR4 Customer Billing | Real wallet/usage reads, unavailable state, monthly spend, responsive Billing UI, local E2E | Sections 4.1, J2-J4/J9 | Core values work; charts, ranges, runs, limits, per-Box cost remain | Mostly |
| PR5 Payment and receipts | Stripe card/checkout/webhook, manual and auto top-up, paid/failed receipts | Sections 7.2/7.3/9, J7/J8/J10 | Placeholder URLs and top-up rows only | No: Stripe account/secrets and Q11/Q12/Q19 |
| PR6 Quota and enforcement | Concurrent limits, zero-balance/frozen gates, grace/auto-pause/recovery | Sections 2.4, 6.5/6.6, 10/11 | Q20 reject-not-clamp already exists; Billing enforcement is not implemented | Partial: Q8/Q9/Q10/Q13/Q17 required before destructive behavior |
| PR7 Admin P0 | Dynamic pricing, customer override, Org 360, ledger, Grant, Frozen | Section 13 P-1/P-2/L-1/L-2/L-3/L-5 | Not implemented | No: milestone conflict, roles, audit/approval policy |

## Current Runtime Evidence

1. A real local lifecycle produced Usage rows, archived rows, a 6-cent rated row, and one `usage_debit`; the wallet changed from `$100.00` to `$99.94`.
2. The Billing page cold-loads `$99.94`, `$0.06` spent, and `$0.06` usage instead of a zero fallback.
3. Five-minute Usage slicing and the next one-minute Settlement sweep were observed in Postgres. A 0-cent short period retained `0.07316` cents in `settlementRemainderCents` instead of losing it.
4. `yarn e2e:billing-local` passed with a `16.668`-cent fixture, a 16-cent debit, API/UI assertions, desktop/mobile screenshots, and exact cleanup.
5. The reused L1 Postgres box can still become unresponsive while its host port remains open after runtime instability. Restarting that L1 box recovers it; this is a local-infra issue, not a Billing correctness mechanism.

## Error Handling

- Billing UI must distinguish loading, unavailable, and zero. Missing query data must never be rendered as a real zero balance.
- Every asynchronous consumer is idempotent in Postgres: one rated row per archived period and one debit row per rated period.
- One Settlement cron calls Rating before Wallet. The two stages no longer race as independent five-minute crons.
- Payment provider effects require provider event idempotency and remain outside the wallet transaction until a verified event arrives.
- Enforcement is triggered from persisted wallet status, not UI state or Redis.

## Verification Strategy

### Per PR

- PR0: organization-region query regression test, TypeORM order-path regression tests, local config test.
- PR1: usage math/service/repository tests plus Metering page test.
- PR2: rate math and Rating service idempotency tests.
- PR3: ordered settlement, sub-cent carry, wallet free-first debit, idempotency, negative-balance and top-up tests.
- PR4: Billing API/controller tests, Billing UI loading/error/real-data tests, cost estimate tests.

### Local chain

```text
create/start/stop Box
  -> assert open/closed usage rows
  -> assert archive row
  -> run or await rating sweep
  -> assert non-zero rated row
  -> run or await wallet sweep
  -> assert one usage_debit and reduced wallet balance
  -> assert Billing API values
  -> assert Billing UI renders the same values
```

The fast suite invokes settlement methods directly against test repositories. `yarn e2e:billing-local` verifies the real cron, Postgres, API, Dex, and Billing page together.

## Product Gates

The following must not be guessed:

- Q2/Q3/Q4/Q5/Q7: free expiry, disk unit, minimum billing unit, and lifecycle billing boundaries.
- Q8/Q9/Q10/Q13/Q17: grace, retention, restart, spend-cap, and Frozen behavior.
- Q11/Q12: minimum top-up and auto-reload monthly cap.
- Q19: receipt versus invoice semantics and finance requirements.
- Stripe test/live account, webhook secret, allowed callback URLs, and payment methods.
- Whether Admin dynamic pricing is M1 P0 or M4, plus Admin roles and adjustment approval/audit policy.
