/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { OrganizationEmail, OrganizationTier, OrganizationWallet } from '@/billing-api'
import { Invoice, PaginatedInvoices, PaymentUrl } from '@/billing-api/types/Invoice'
import { Tier } from '@/billing-api/types/tier'
import { BoxliteConfiguration } from '@boxlite-ai/api-client/src'
import { http, HttpResponse } from 'msw'

const BILLING_API_URL = 'http://localhost:3000/api/billing'
const API_URL = (import.meta.env.VITE_BASE_API_URL ?? window.location.origin) + '/api'

const adminPreviewBoxes = [
  {
    id: 'box-brian-001',
    organizationId: 'org-brian',
    state: 'started',
    runnerId: 'runner-ready-01',
    cpu: 2,
    memoryGiB: 4,
    createdAt: '2026-05-24T09:10:00.000Z',
    owner: { name: 'Brian Luo', email: 'brian@example.com', orgName: 'Brian', personal: true },
  },
  {
    id: 'box-brian-002',
    organizationId: 'org-brian',
    state: 'error',
    runnerId: 'runner-ready-01',
    cpu: 1,
    memoryGiB: 2,
    createdAt: '2026-05-24T10:40:00.000Z',
    owner: { name: 'Brian Luo', email: 'brian@example.com', orgName: 'Brian', personal: true },
  },
  {
    id: 'box-markov-001',
    organizationId: 'org-markov',
    state: 'build_failed',
    runnerId: 'runner-stale-03',
    cpu: 1,
    memoryGiB: 1,
    createdAt: '2026-05-23T18:20:00.000Z',
    owner: { name: 'Markov Wong', email: 'markov@example.com', orgName: 'Markov Lab', personal: false },
  },
  {
    id: 'box-dorian-001',
    organizationId: 'org-dorian',
    state: 'stopped',
    runnerId: null,
    cpu: 4,
    memoryGiB: 8,
    createdAt: '2026-05-22T12:00:00.000Z',
    owner: { name: 'Dorian Zheng', email: 'dorian@example.com', orgName: 'Dorian', personal: true },
  },
  {
    id: 'box-rui-001',
    organizationId: 'org-rui',
    state: 'started',
    runnerId: 'runner-hot-02',
    cpu: 6,
    memoryGiB: 12,
    createdAt: '2026-05-21T08:30:00.000Z',
    owner: { name: 'Rui Long', email: 'rui@example.com', orgName: 'Rui Ops', personal: false },
  },
]

const adminPreviewRunners = [
  {
    id: 'runner-ready-01',
    state: 'ready',
    cpu: 16,
    memory: 64,
    currentAllocatedCpu: 7,
    currentAllocatedMemoryGiB: 22,
    currentStartedSandboxes: 2,
    availabilityScore: 0.94,
    draining: false,
    unschedulable: false,
  },
  {
    id: 'runner-hot-02',
    state: 'ready',
    cpu: 16,
    memory: 64,
    currentAllocatedCpu: 14,
    currentAllocatedMemoryGiB: 51,
    currentStartedSandboxes: 1,
    availabilityScore: 0.66,
    draining: false,
    unschedulable: false,
  },
  {
    id: 'runner-stale-03',
    state: 'unresponsive',
    cpu: 8,
    memory: 32,
    currentAllocatedCpu: 1,
    currentAllocatedMemoryGiB: 1,
    currentStartedSandboxes: 1,
    availabilityScore: 0.18,
    draining: false,
    unschedulable: true,
  },
]

const GiB = 1024 * 1024 * 1024

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function metricSeries(metricName: string, values: number[]) {
  return {
    metricName,
    dataPoints: values.map((value, index) => ({
      timestamp: minutesAgo((values.length - index - 1) * 5),
      value,
    })),
  }
}

const adminTelemetryLogs = [
  {
    timestamp: minutesAgo(3),
    body: 'GET /api/admin/telemetry/metrics completed in 184ms',
    severityText: 'INFO',
    severityNumber: 9,
    serviceName: 'boxlite-api',
    resourceAttributes: { 'service.name': 'boxlite-api' },
    logAttributes: { route: '/api/admin/telemetry/metrics', duration_ms: '184' },
    traceId: 'trace-telemetry-metrics',
    spanId: 'span-root-metrics',
  },
  {
    timestamp: minutesAgo(8),
    body: 'DB pending requests spiked while loading admin boxes',
    severityText: 'WARN',
    severityNumber: 13,
    serviceName: 'boxlite-api',
    resourceAttributes: { 'service.name': 'boxlite-api' },
    logAttributes: { pending_requests: '7', component: 'admin.overview' },
    traceId: 'trace-admin-boxes',
    spanId: 'span-db-boxes',
  },
  {
    timestamp: minutesAgo(14),
    body: 'SandboxManager.autostopCheck completed',
    severityText: 'DEBUG',
    severityNumber: 5,
    serviceName: 'boxlite-api',
    resourceAttributes: { 'service.name': 'boxlite-api' },
    logAttributes: { job: 'SandboxManager.autostopCheck', duration_ms: '820' },
  },
  {
    timestamp: minutesAgo(19),
    body: 'Failed to refresh runner heartbeat for runner-stale-03',
    severityText: 'ERROR',
    severityNumber: 17,
    serviceName: 'boxlite-api',
    resourceAttributes: { 'service.name': 'boxlite-api' },
    logAttributes: { runner_id: 'runner-stale-03' },
    traceId: 'trace-runner-error',
    spanId: 'span-root-runner',
  },
]

const adminTelemetryTraces = [
  {
    traceId: 'trace-admin-boxes',
    rootSpanName: 'POST /api/admin/boxes/search',
    startTime: minutesAgo(4),
    endTime: minutesAgo(4),
    durationMs: 312,
    spanCount: 18,
    statusCode: 'STATUS_CODE_UNSET',
  },
  {
    traceId: 'trace-telemetry-metrics',
    rootSpanName: 'GET /api/admin/telemetry/metrics',
    startTime: minutesAgo(7),
    endTime: minutesAgo(7),
    durationMs: 184,
    spanCount: 11,
    statusCode: 'STATUS_CODE_UNSET',
  },
  {
    traceId: 'trace-admin-overview',
    rootSpanName: 'GET /api/admin/overview',
    startTime: minutesAgo(11),
    endTime: minutesAgo(11),
    durationMs: 86,
    spanCount: 9,
    statusCode: 'STATUS_CODE_UNSET',
  },
  {
    traceId: 'trace-runner-error',
    rootSpanName: 'GET /api/admin/runners',
    startTime: minutesAgo(18),
    endTime: minutesAgo(18),
    durationMs: 44,
    spanCount: 6,
    statusCode: 'STATUS_CODE_ERROR',
  },
]

const adminTelemetrySpans = {
  'trace-admin-boxes': [
    {
      traceId: 'trace-admin-boxes',
      spanId: 'span-root-boxes',
      spanName: 'POST /api/admin/boxes/search',
      timestamp: minutesAgo(4),
      durationNs: 312_000_000,
      spanAttributes: { route: '/api/admin/boxes/search', method: 'POST' },
    },
    {
      traceId: 'trace-admin-boxes',
      spanId: 'span-auth-boxes',
      parentSpanId: 'span-root-boxes',
      spanName: 'CombinedAuthGuard',
      timestamp: minutesAgo(4),
      durationNs: 25_000_000,
      spanAttributes: { guard: 'CombinedAuthGuard' },
    },
    {
      traceId: 'trace-admin-boxes',
      spanId: 'span-db-boxes',
      parentSpanId: 'span-root-boxes',
      spanName: 'AdminOverviewService.listBoxes',
      timestamp: new Date(Date.now() - 4 * 60_000 + 54).toISOString(),
      durationNs: 181_000_000,
      spanAttributes: { db: 'postgres', table: 'sandbox' },
    },
    {
      traceId: 'trace-admin-boxes',
      spanId: 'span-dto-boxes',
      parentSpanId: 'span-root-boxes',
      spanName: 'serialize admin boxes',
      timestamp: new Date(Date.now() - 4 * 60_000 + 250).toISOString(),
      durationNs: 41_000_000,
      spanAttributes: { boxes: '38' },
    },
  ],
  'trace-telemetry-metrics': [
    {
      traceId: 'trace-telemetry-metrics',
      spanId: 'span-root-metrics',
      spanName: 'GET /api/admin/telemetry/metrics',
      timestamp: minutesAgo(7),
      durationNs: 184_000_000,
      spanAttributes: { route: '/api/admin/telemetry/metrics', method: 'GET' },
    },
    {
      traceId: 'trace-telemetry-metrics',
      spanId: 'span-clickhouse-metrics',
      parentSpanId: 'span-root-metrics',
      spanName: 'ClickHouse metrics query',
      timestamp: new Date(Date.now() - 7 * 60_000 + 33).toISOString(),
      durationNs: 118_000_000,
      spanAttributes: { db: 'clickhouse', database: 'otel' },
    },
    {
      traceId: 'trace-telemetry-metrics',
      spanId: 'span-normalize-metrics',
      parentSpanId: 'span-root-metrics',
      spanName: 'normalize metric series',
      timestamp: new Date(Date.now() - 7 * 60_000 + 154).toISOString(),
      durationNs: 18_000_000,
      spanAttributes: { series: '24' },
    },
  ],
  'trace-admin-overview': [
    {
      traceId: 'trace-admin-overview',
      spanId: 'span-root-overview',
      spanName: 'GET /api/admin/overview',
      timestamp: minutesAgo(11),
      durationNs: 86_000_000,
      spanAttributes: { route: '/api/admin/overview', method: 'GET' },
    },
    {
      traceId: 'trace-admin-overview',
      spanId: 'span-db-overview',
      parentSpanId: 'span-root-overview',
      spanName: 'AdminOverviewService.load',
      timestamp: new Date(Date.now() - 11 * 60_000 + 19).toISOString(),
      durationNs: 30_000_000,
      spanAttributes: { db: 'postgres' },
    },
  ],
  'trace-runner-error': [
    {
      traceId: 'trace-runner-error',
      spanId: 'span-root-runner',
      spanName: 'GET /api/admin/runners',
      timestamp: minutesAgo(18),
      durationNs: 44_000_000,
      spanAttributes: { route: '/api/admin/runners', method: 'GET' },
      statusCode: 'STATUS_CODE_ERROR',
      statusMessage: 'runner heartbeat stale',
    },
  ],
}

const adminTelemetryMetrics = [
  metricSeries('http.server.duration', [0.082, 0.094, 0.12, 0.184, 0.176, 0.14, 0.158]),
  metricSeries('http.client.duration', [0.044, 0.052, 0.061, 0.072, 0.068, 0.057, 0.063]),
  metricSeries('db.client.operation.duration', [0.028, 0.034, 0.041, 0.091, 0.084, 0.062, 0.071]),
  metricSeries('db.client.connection.pending_requests', [0, 1, 2, 7, 4, 1, 2]),
  metricSeries('db.client.connection.count', [5, 5, 6, 6, 6, 5, 5]),
  metricSeries('nodejs.eventloop.delay.p99', [0.014, 0.016, 0.019, 0.021, 0.018, 0.017, 0.019]),
  metricSeries('nodejs.eventloop.delay.p90', [0.009, 0.011, 0.012, 0.014, 0.013, 0.012, 0.013]),
  metricSeries('nodejs.eventloop.delay.mean', [0.006, 0.007, 0.008, 0.009, 0.008, 0.008, 0.008]),
  metricSeries('nodejs.eventloop.delay.max', [0.026, 0.031, 0.038, 0.044, 0.035, 0.029, 0.033]),
  metricSeries('nodejs.eventloop.utilization', [0.31, 0.34, 0.38, 0.42, 0.37, 0.33, 0.36]),
  metricSeries('nodejs.eventloop.time', [0.18, 0.21, 0.24, 0.28, 0.25, 0.22, 0.23]),
  metricSeries('v8js.gc.duration', [0.002, 0.003, 0.004, 0.0048, 0.0034, 0.003, 0.0036]),
  metricSeries(
    'v8js.memory.heap.used',
    [0.62, 0.66, 0.7, 0.72, 0.71, 0.69, 0.72].map((value) => value * GiB),
  ),
  metricSeries('v8js.memory.heap.limit', Array(7).fill(1.54 * GiB)),
  metricSeries(
    'v8js.memory.heap.space.available_size',
    [0.91, 0.87, 0.83, 0.81, 0.82, 0.84, 0.81].map((value) => value * GiB),
  ),
  metricSeries(
    'v8js.memory.heap.space.physical_size',
    [0.74, 0.76, 0.78, 0.79, 0.78, 0.77, 0.79].map((value) => value * GiB),
  ),
  metricSeries('sandbox_manager_autostop_check_duration', [0.42, 0.58, 0.61, 1.42, 0.82, 0.76, 0.69]),
  metricSeries('runner_sync_service_reconcile_duration', [0.21, 0.34, 0.39, 0.79, 0.46, 0.38, 0.41]),
  metricSeries('sandbox_manager_auto_archive_duration', [0.18, 0.22, 0.26, 0.48, 0.31, 0.27, 0.29]),
  metricSeries('machine_health_probe_scan_duration', [0.11, 0.14, 0.18, 0.31, 0.24, 0.2, 0.19]),
]

export const handlers = [
  http.get(`${API_URL}/config`, async () => {
    return HttpResponse.json<Partial<BoxliteConfiguration>>({
      version: '0.0.0-local',
      oidc: {
        issuer: 'https://mock.auth.boxlite.local',
        clientId: 'mock-client',
        audience: 'mock-api',
      },
      linkedAccountsEnabled: false,
      announcements: {},
      proxyTemplateUrl: 'https://{{PORT}}-{{sandboxId}}.proxy.localhost',
      proxyToolboxUrl: 'https://toolbox.proxy.localhost',
      defaultSnapshot: 'ubuntu:22.04',
      dashboardUrl: window.location.origin,
      maxAutoArchiveInterval: 43200,
      maintananceMode: false,
      environment: 'local',
      billingApiUrl: BILLING_API_URL,
      rateLimit: {},
    })
  }),
  http.get(`${API_URL}/organizations`, async () => {
    return HttpResponse.json([
      {
        id: 'org-brian',
        name: 'Personal',
        personal: true,
        defaultRegionId: 'mock-region',
      },
    ])
  }),
  http.get(`${API_URL}/regions`, async () => {
    return HttpResponse.json([
      {
        id: 'mock-region',
        name: 'Singapore dev',
        organizationId: null,
        regionType: 'shared',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ])
  }),
  http.get(`${API_URL}/shared-regions`, async () => {
    return HttpResponse.json([
      {
        id: 'mock-region',
        name: 'Singapore dev',
        organizationId: null,
        regionType: 'shared',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ])
  }),
  http.get(`${API_URL}/organizations/invitations`, async () => {
    return HttpResponse.json([])
  }),
  http.get(`${API_URL}/organizations/:organizationId/users`, async () => {
    return HttpResponse.json([
      {
        userId: 'mock-admin-user',
        role: 'owner',
        permissions: ['read:volumes', 'read:audit_logs', 'read:runners'],
        assignedRoles: [
          {
            id: 'owner-role',
            name: 'Owner',
            permissions: ['read:volumes', 'read:audit_logs', 'read:runners'],
          },
        ],
        user: { id: 'mock-admin-user', email: 'brian@example.com', name: 'Brian Luo' },
      },
    ])
  }),
  http.get(`${API_URL}/webhooks/organizations/:organizationId/initialization-status`, async () => {
    return HttpResponse.json({})
  }),
  http.get(`${API_URL}/webhooks/organizations/:organizationId/app-portal-access`, async () => {
    return HttpResponse.json({ token: null, url: null })
  }),
  http.get(`${API_URL}/admin/overview`, async () => {
    return HttpResponse.json({
      users: 27,
      activeBoxes: adminPreviewBoxes.filter((box) => box.state === 'started').length,
      boxes: {
        total: adminPreviewBoxes.length,
        byState: adminPreviewBoxes.reduce<Record<string, number>>((acc, box) => {
          acc[box.state] = (acc[box.state] ?? 0) + 1
          return acc
        }, {}),
      },
      runners: {
        online: adminPreviewRunners.filter((runner) => runner.state === 'ready').length,
        total: adminPreviewRunners.length,
        draining: adminPreviewRunners.filter((runner) => runner.draining).length,
      },
      cluster: { cpuUtil: 0.52, oversell: 1.2 },
    })
  }),
  http.get(`${API_URL}/admin/overview/users`, async () => {
    return HttpResponse.json([
      { id: 'mock-admin-user', email: 'brian@example.com', name: 'Brian Luo', role: 'ADMIN' },
      { id: 'mock-markov-user', email: 'markov@example.com', name: 'Markov Wong', role: 'USER' },
    ])
  }),
  http.get(`${API_URL}/admin/overview/boxes`, async () => {
    return HttpResponse.json(adminPreviewBoxes)
  }),
  http.get(`${API_URL}/admin/overview/runners`, async () => {
    return HttpResponse.json(adminPreviewRunners)
  }),
  http.get(`${API_URL}/admin/overview/machines`, async () => {
    return HttpResponse.json([
      {
        host: 'i-ops-a',
        region: 'ap-southeast-1a',
        oversellCpu: 1.2,
        cpuWaterline: 74,
        memWaterline: 62,
        sandboxes: 3,
      },
      {
        host: 'i-ops-b',
        region: 'ap-southeast-1b',
        oversellCpu: 0.8,
        cpuWaterline: 28,
        memWaterline: 34,
        sandboxes: 1,
      },
    ])
  }),
  http.get(`${API_URL}/admin/telemetry/logs`, async ({ request }) => {
    const url = new URL(request.url)
    const severities = url.searchParams.getAll('severities').map((severity) => severity.toUpperCase())
    const search = url.searchParams.get('search')?.toLowerCase()
    const items = adminTelemetryLogs.filter((log) => {
      const matchesSeverity = severities.length === 0 || severities.includes(log.severityText)
      const matchesSearch = !search || log.body.toLowerCase().includes(search)
      return matchesSeverity && matchesSearch
    })
    return HttpResponse.json({ items, total: items.length, page: 1, totalPages: 1 })
  }),
  http.get(`${API_URL}/admin/telemetry/traces`, async () => {
    return HttpResponse.json({
      items: adminTelemetryTraces,
      total: adminTelemetryTraces.length,
      page: 1,
      totalPages: 1,
    })
  }),
  http.get(`${API_URL}/admin/telemetry/traces/:traceId`, async ({ params }) => {
    const traceId = String(params.traceId)
    return HttpResponse.json(adminTelemetrySpans[traceId as keyof typeof adminTelemetrySpans] ?? [])
  }),
  http.get(`${API_URL}/admin/telemetry/metrics`, async () => {
    return HttpResponse.json({ series: adminTelemetryMetrics })
  }),
  http.get(`${BILLING_API_URL}/organization/:organizationId/portal-url`, async () => {
    return HttpResponse.json<string>(`${BILLING_API_URL}/portal`)
  }),
  http.get(`${BILLING_API_URL}/tier`, async () => {
    return HttpResponse.json<Tier[]>([
      {
        tier: 1,
        tierLimit: {
          concurrentCPU: 10,
          concurrentRAMGiB: 20,
          concurrentDiskGiB: 30,
        },
        minTopUpAmountCents: 0,
        topUpIntervalDays: 0,
      },
      {
        tier: 2,
        tierLimit: {
          concurrentCPU: 100,
          concurrentRAMGiB: 200,
          concurrentDiskGiB: 300,
        },
        minTopUpAmountCents: 2500,
        topUpIntervalDays: 0,
      },
      {
        tier: 3,
        tierLimit: {
          concurrentCPU: 250,
          concurrentRAMGiB: 500,
          concurrentDiskGiB: 2000,
        },
        minTopUpAmountCents: 50000,
        topUpIntervalDays: 0,
      },
      {
        tier: 4,
        tierLimit: {
          concurrentCPU: 500,
          concurrentRAMGiB: 1000,
          concurrentDiskGiB: 5000,
        },
        minTopUpAmountCents: 200000,
        topUpIntervalDays: 30,
      },
    ])
  }),
  http.get(`${BILLING_API_URL}/organization/:organizationId/wallet`, async () => {
    return HttpResponse.json<OrganizationWallet>({
      balanceCents: 1000,
      ongoingBalanceCents: 1000,
      name: 'Wallet',
      creditCardConnected: false,
      automaticTopUp: undefined,
      hasFailedOrPendingInvoice: true,
    })
  }),
  http.get(`${BILLING_API_URL}/organization/:organizationId/tier`, async () => {
    return HttpResponse.json<OrganizationTier>({
      tier: 2,
      largestSuccessfulPaymentDate: new Date(),
      largestSuccessfulPaymentCents: 1000,
      expiresAt: new Date(),
      hasVerifiedBusinessEmail: true,
    })
  }),
  http.get(`${BILLING_API_URL}/organization/:organizationId/email`, async () => {
    return HttpResponse.json<OrganizationEmail[]>([
      {
        email: 'user@example.com',
        verified: true,
        owner: true,
        business: false,
        verifiedAt: new Date(),
      },
    ])
  }),
  http.get(`${BILLING_API_URL}/organization/:organizationId/invoices`, async ({ request, params }) => {
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const perPage = parseInt(url.searchParams.get('perPage') || '50', 10)

    const mockInvoices: Invoice[] = [
      {
        id: 'inv-001',
        number: 'INV-2026-001',
        currency: 'USD',
        issuingDate: new Date('2026-01-01').toISOString(),
        paymentDueDate: new Date('2026-01-15').toISOString(),
        paymentOverdue: false,
        paymentStatus: 'succeeded',
        sequentialId: 1,
        status: 'finalized',
        totalAmountCents: 9847,
        totalDueAmountCents: 0,
        type: 'subscription',
        fileUrl: 'https://example.com/invoices/inv-001.pdf',
      },
      {
        id: 'inv-004',
        number: 'INV-2025-010',
        currency: 'USD',
        issuingDate: new Date('2025-10-01').toISOString(),
        paymentDueDate: new Date('2025-10-15').toISOString(),
        paymentOverdue: true,
        paymentStatus: 'pending',
        sequentialId: 10,
        status: 'finalized',
        totalAmountCents: 12150,
        totalDueAmountCents: 12150,
        type: 'subscription',
        fileUrl: 'https://example.com/invoices/inv-004.pdf',
      },
      {
        id: 'inv-009',
        number: 'INV-2030-010',
        currency: 'USD',
        issuingDate: new Date('2025-10-01').toISOString(),
        paymentDueDate: new Date('2030-10-15').toISOString(),
        paymentOverdue: false,
        paymentStatus: 'pending',
        sequentialId: 10,
        status: 'pending',
        totalAmountCents: 12150,
        totalDueAmountCents: 12150,
        type: 'subscription',
        fileUrl: 'https://example.com/invoices/inv-004.pdf',
      },
      {
        id: 'inv-005',
        number: 'INV-2025-009',
        currency: 'USD',
        issuingDate: new Date('2025-09-01').toISOString(),
        paymentDueDate: new Date('2025-09-15').toISOString(),
        paymentOverdue: false,
        paymentStatus: 'failed',
        sequentialId: 9,
        status: 'failed',
        totalAmountCents: 8900,
        totalDueAmountCents: 0,
        type: 'add_on',
        fileUrl: 'https://example.com/invoices/inv-005.pdf',
      },
    ]

    const startIndex = (page - 1) * perPage
    const endIndex = startIndex + perPage
    const paginatedItems = mockInvoices.slice(startIndex, endIndex)
    const totalItems = mockInvoices.length
    const totalPages = Math.ceil(totalItems / perPage)

    return HttpResponse.json<PaginatedInvoices>({
      items: paginatedItems,
      totalItems,
      totalPages,
    })
  }),
  http.post(`${BILLING_API_URL}/organization/:organizationId/invoices/:invoiceId/payment-url`, async () => {
    return HttpResponse.json<PaymentUrl>({
      url: 'https://checkout.stripe.com/pay/cs_test_1234567890',
    })
  }),
  http.post(`${BILLING_API_URL}/organization/:organizationId/invoices/:invoiceId/void`, async () => {
    return HttpResponse.json({})
  }),
  http.post(`${BILLING_API_URL}/organization/:organizationId/wallet/top-up`, async () => {
    return HttpResponse.json<PaymentUrl>({
      url: `https://checkout.stripe.com/pay/cs_test_${Date.now()}`,
    })
  }),
]
