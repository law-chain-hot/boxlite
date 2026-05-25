/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { OrganizationEmail, OrganizationTier, OrganizationWallet } from '@/billing-api'
import { Invoice, PaginatedInvoices, PaymentUrl } from '@/billing-api/types/Invoice'
import { Tier } from '@/billing-api/types/tier'
import { BoxliteConfiguration } from '@boxlite-ai/api-client/src'
import { bypass, http, HttpResponse } from 'msw'

const BILLING_API_URL = 'http://localhost:3000/api/billing'
const API_URL = import.meta.env.VITE_API_URL

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

export const handlers = [
  http.get(`${API_URL}/config`, async () => {
    const originalConfig = await fetch(bypass(`${API_URL}/config`)).then((res) => res.json())

    return HttpResponse.json<Partial<BoxliteConfiguration>>({
      ...originalConfig,
      billingApiUrl: BILLING_API_URL,
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
  http.get(`${API_URL}/admin/telemetry/logs`, async () => {
    return HttpResponse.json({ items: [], nextCursor: null })
  }),
  http.get(`${API_URL}/admin/telemetry/traces`, async () => {
    return HttpResponse.json({ items: [], nextCursor: null })
  }),
  http.get(`${API_URL}/admin/telemetry/metrics`, async () => {
    return HttpResponse.json({ series: [] })
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
