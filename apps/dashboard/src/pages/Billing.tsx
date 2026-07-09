/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BillableMetricCode, OrganizationUsage } from '@/billing-api/types/OrganizationUsage'
import { BalanceOverviewCard } from '@/components/billing/BalanceOverviewCard'
import { BillingPanel } from '@/components/billing/BillingPanel'
import { QuotaPanel } from '@/components/billing/QuotaPanel'
import { SectionTitle } from '@/components/billing/ascii'
import { SuspendedBanner } from '@/components/billing/SuspendedBanner'
import { UsageTrendCharts } from '@/components/billing/UsageTrendCharts'
import { PageContent, PageHeader, PageLayout, PageTitle } from '@/components/PageLayout'
import { Button } from '@/components/ui/button'
import { Database } from '@/components/ui/icon'
import { RoutePath } from '@/enums/RoutePath'
import { useSetAutomaticTopUpMutation } from '@/hooks/mutations/useSetAutomaticTopUpMutation'
import { useTopUpWalletMutation } from '@/hooks/mutations/useTopUpWalletMutation'
import { useOwnerInvoicesQuery, useOwnerWalletQuery } from '@/hooks/queries/billingQueries'
import { useOrganizationUsageQuery } from '@/hooks/queries/useOrganizationUsageQuery'
import { useTiersQuery } from '@/hooks/queries/useTiersQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

function centsToUsdNumber(cents: number | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function usageCharge(usage: OrganizationUsage | undefined, metric: BillableMetricCode) {
  return usage?.usageCharges.find((charge) => charge.billableMetric === metric)
}

function unitsNumber(usage: OrganizationUsage | undefined, metric: BillableMetricCode): number {
  const units = usageCharge(usage, metric)?.units ?? '0'
  return Number.parseFloat(units) || 0
}

function hoursFromSeconds(seconds: number): string {
  return (seconds / 3600).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function sandboxRuns(usage: OrganizationUsage | undefined): string {
  const count = usage?.usageCharges.reduce((sum, charge) => sum + charge.eventsCount, 0) ?? 0
  return count.toLocaleString('en-US')
}

function Billing() {
  const { selectedOrganization } = useSelectedOrganization()
  const organizationId = selectedOrganization?.id ?? ''
  const walletQuery = useOwnerWalletQuery({ refetchOnMount: 'always' })
  const invoicesQuery = useOwnerInvoicesQuery(1, 20)
  const usageQuery = useOrganizationUsageQuery({ organizationId, enabled: Boolean(organizationId) })
  const tiersQuery = useTiersQuery({ enabled: Boolean(organizationId) })
  const topUpMutation = useTopUpWalletMutation()
  const automaticTopUpMutation = useSetAutomaticTopUpMutation()
  const [activeTab, setActiveTab] = useState<'usage' | 'billing'>('usage')
  const [rangeLabel, setRangeLabel] = useState('Last 30 days')

  const wallet = walletQuery.data
  const usage = usageQuery.data
  const currentTier = tiersQuery.data?.[0]
  const currentBalance = wallet?.ongoingBalanceCents ?? 0
  const spentThisMonth = wallet ? wallet.balanceCents - wallet.ongoingBalanceCents : (usage?.totalAmountCents ?? 0)
  const currentTierLimits = {
    boxes: 10,
    cpu: currentTier?.tierLimit.concurrentCPU ?? 10,
    ramGiB: currentTier?.tierLimit.concurrentRAMGiB ?? 20,
    diskGiB: currentTier?.tierLimit.concurrentDiskGiB ?? 30,
  }

  const usageStats = useMemo(
    () => ({
      costTotal: centsToUsdNumber(usage?.totalAmountCents ?? spentThisMonth),
      vcpuHours: hoursFromSeconds(unitsNumber(usage, BillableMetricCode.CPU_USAGE)),
      ramHours: hoursFromSeconds(unitsNumber(usage, BillableMetricCode.RAM_USAGE)),
      sandboxCount: sandboxRuns(usage),
    }),
    [spentThisMonth, usage],
  )

  if (!selectedOrganization) {
    return (
      <PageLayout>
        <PageHeader size="full">
          <PageTitle className="font-mono text-[28px] font-semibold normal-case tracking-[-0.02em] text-foreground">
            Billing
          </PageTitle>
        </PageHeader>
        <PageContent size="full">
          <div className="border border-border bg-card px-[22px] py-6 font-mono text-[13px] text-muted-foreground">
            Select an organization to view billing.
          </div>
        </PageContent>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <PageHeader size="full">
        <PageTitle className="font-mono text-[28px] font-semibold normal-case tracking-[-0.02em] text-foreground">
          Billing
        </PageTitle>
        <Button asChild variant="secondary" size="sm" className="ml-auto font-mono">
          <Link to={RoutePath.METERING}>
            <Database className="size-3.5" />
            Metering data
          </Link>
        </Button>
      </PageHeader>

      <PageContent size="full" className="gap-6">
        <div className="flex items-center">
          <div className="inline-flex border border-border bg-background">
            {(['usage', 'billing'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'min-w-[92px] px-5 py-3 font-mono text-[13px] transition-colors',
                  activeTab === tab ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab === 'usage' ? 'Usage' : 'Billing'}
              </button>
            ))}
          </div>
        </div>

        {wallet?.billingStatus === 'suspended' || wallet?.billingStatus === 'frozen' ? <SuspendedBanner /> : null}

        {activeTab === 'usage' ? (
          <div className="flex flex-col gap-9">
            <BalanceOverviewCard
              currentBalanceCents={currentBalance}
              spentThisMonthCents={spentThisMonth}
              creditCardConnected={Boolean(wallet?.creditCardConnected)}
            />

            <QuotaPanel tier={currentTier?.tier ?? 1} limits={currentTierLimits} />

            <div>
              <SectionTitle
                title="Usage over time"
                right={
                  <div className="flex flex-wrap items-center gap-2">
                    {['Last 1 hour', 'Last 6 hours', 'Last 24 hours', 'Last 7 days', 'Last 30 days'].map((range) => (
                      <Button
                        key={range}
                        size="sm"
                        variant={rangeLabel === range ? 'default' : 'secondary'}
                        onClick={() => setRangeLabel(range)}
                      >
                        {range}
                      </Button>
                    ))}
                    <Button size="sm" variant="secondary" onClick={() => setRangeLabel('Custom range')}>
                      Custom range
                    </Button>
                  </div>
                }
              />
              <UsageTrendCharts {...usageStats} />
            </div>
          </div>
        ) : (
          <BillingPanel
            automaticTopUp={wallet?.automaticTopUp}
            invoices={invoicesQuery.data?.items ?? []}
            isSavingAutomaticTopUp={automaticTopUpMutation.isPending}
            isCreatingTopUp={topUpMutation.isPending}
            onSaveAutomaticTopUp={(automaticTopUp) =>
              automaticTopUpMutation.mutateAsync({
                organizationId,
                automaticTopUp,
              })
            }
            onTopUp={(amountCents) =>
              topUpMutation.mutateAsync({
                organizationId,
                amountCents,
              })
            }
          />
        )}
      </PageContent>
    </PageLayout>
  )
}

export default Billing
