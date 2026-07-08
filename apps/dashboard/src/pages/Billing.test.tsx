// @vitest-environment jsdom
/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Billing from './Billing'

const mutationMocks = vi.hoisted(() => ({
  setAutomaticTopUp: vi.fn(),
  topUpWallet: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/components/PageLayout', () => ({
  PageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  PageContent: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  PageTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}))

vi.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => ({
    selectedOrganization: { id: 'org-1', name: 'Acme' },
    authenticatedUserOrganizationMember: { role: 'OWNER' },
  }),
}))

vi.mock('@/hooks/queries/billingQueries', () => ({
  useOwnerWalletQuery: () => ({
    data: {
      balanceCents: 10000,
      ongoingBalanceCents: 8400,
      name: 'Acme',
      creditCardConnected: false,
      automaticTopUp: { thresholdAmount: 20, targetAmount: 100 },
      hasFailedOrPendingInvoice: false,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useOwnerInvoicesQuery: () => ({
    data: { items: [], totalItems: 0, totalPages: 0 },
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/hooks/queries/useOrganizationUsageQuery', () => ({
  useOrganizationUsageQuery: () => ({
    data: {
      amountCents: 1600,
      totalAmountCents: 1600,
      usageCharges: [
        { billableMetric: 'cpu_usage', units: '7200', amountCents: 1008, eventsCount: 1 },
        { billableMetric: 'ram_usage', units: '14400', amountCents: 648, eventsCount: 1 },
        { billableMetric: 'disk_usage', units: '36000', amountCents: 11, eventsCount: 1 },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/hooks/queries/usePastOrganizationUsageQuery', () => ({
  usePastOrganizationUsageQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/hooks/queries/useTiersQuery', () => ({
  useTiersQuery: () => ({
    data: [
      {
        tier: 1,
        tierLimit: { concurrentCPU: 10, concurrentRAMGiB: 20, concurrentDiskGiB: 30 },
        minTopUpAmountCents: 0,
        topUpIntervalDays: 0,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/hooks/mutations/useSetAutomaticTopUpMutation', () => ({
  useSetAutomaticTopUpMutation: () => ({ mutateAsync: mutationMocks.setAutomaticTopUp, isPending: false }),
}))

vi.mock('@/hooks/mutations/useTopUpWalletMutation', () => ({
  useTopUpWalletMutation: () => ({ mutateAsync: mutationMocks.topUpWallet, isPending: false }),
}))

async function flushReactWork() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('Billing page', () => {
  let root: Root | null = null

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  async function renderBilling() {
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      root = createRoot(host)
      root.render(<Billing />)
    })

    await flushReactWork()
  }

  it('renders the Billing V2 usage and billing tabs instead of the launch placeholder', async () => {
    await renderBilling()

    expect(document.body.textContent).toContain('Usage')
    expect(document.body.textContent).toContain('Billing')
    expect(document.body.textContent).toContain('Current balance')
    expect(document.body.textContent).toContain('Usage Cost')
    expect(document.body.textContent).toContain('Limits')

    const billingTab = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Billing')
    expect(billingTab).not.toBeUndefined()

    await act(async () => {
      billingTab?.click()
    })
    await flushReactWork()

    expect(document.body.textContent).toContain('Auto-reload')
    expect(document.body.textContent).not.toContain('Billing is on the way')
  })

  it('renders product billing controls with editable auto top-up, custom range, receipt search, and top-up confirmation', async () => {
    await renderBilling()

    expect(document.body.textContent).toContain('Payment method')
    expect(document.body.textContent).toContain('Custom range')
    expect(document.body.textContent).toContain('Concurrent capacity')
    expect(document.body.textContent).toContain('Per-box max & rate limits')

    const billingTab = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Billing')
    await act(async () => {
      billingTab?.click()
    })
    await flushReactWork()

    expect(document.body.textContent).toContain('Top-up')
    expect(document.body.textContent).toContain('Receipts')
    expect(document.body.textContent).toContain('One-time top-up')

    const editButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Edit')
    await act(async () => {
      editButton?.click()
    })
    await flushReactWork()

    expect(document.body.textContent).toContain('Enable auto-reload')
    expect(document.body.textContent).toContain('When balance below')

    const cancelButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Cancel')
    await act(async () => {
      cancelButton?.click()
    })
    await flushReactWork()

    const topUpButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '$500')
    await act(async () => {
      topUpButton?.click()
    })
    await flushReactWork()

    const topUpTrigger = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Top up'))
    await act(async () => {
      topUpTrigger?.click()
    })
    await flushReactWork()

    expect(document.body.textContent).toContain('Confirm top-up')
  })
})
