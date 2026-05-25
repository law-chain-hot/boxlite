/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PageContent, PageHeader, PageLayout, PageTitle } from '@/components/PageLayout'
import { type AdminBox, findBoxById, groupBoxesByOwner } from '@/components/admin/adminHelpers'
import AdminFleetView from '@/components/admin/AdminFleetView'
import AdminOverviewView from '@/components/admin/AdminOverviewView'
import AdminPeopleBoxesView from '@/components/admin/AdminPeopleBoxesView'
import AdminTelemetryDrawer from '@/components/admin/AdminTelemetryDrawer'
import { useAdminActions, useAdminBoxes, useAdminOverview, useAdminRunners } from '@/components/admin/useAdminData'
import { Input } from '@/components/ui/input'
import { RoutePath } from '@/enums/RoutePath'
import { cn } from '@/lib/utils'
import { Search } from 'lucide-react'
import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'

type AdminView = 'overview' | 'people' | 'fleet'

const VIEWS: { id: AdminView; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'monitor' },
  { id: 'people', label: 'People & Boxes', hint: 'who · what' },
  { id: 'fleet', label: 'Fleet', hint: 'where it runs' },
]

const Admin: React.FC = () => {
  const [view, setView] = useState<AdminView>('overview')
  const [query, setQuery] = useState('')
  const [runnerFilter, setRunnerFilter] = useState<string | null>(null)
  const [highlightRunner, setHighlightRunner] = useState<string | null>(null)
  const [selectedBox, setSelectedBox] = useState<AdminBox | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const overviewQuery = useAdminOverview()
  const boxesQuery = useAdminBoxes()
  const runnersQuery = useAdminRunners()
  const { recover } = useAdminActions()

  // 403 gate — non-admins are redirected (backend is the real guard).
  if (overviewQuery.isError && (overviewQuery.error as { response?: { status?: number } })?.response?.status === 403) {
    return <Navigate to={RoutePath.DASHBOARD} replace />
  }

  const openBox = (box: AdminBox) => {
    setSelectedBox(box)
    setDrawerOpen(true)
  }

  const handleSearchChange = (value: string) => {
    setQuery(value)
    setRunnerFilter(null)
    if (value) setView('people')

    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return

    // Pasting a full box id jumps straight into telemetry. Real box ids are
    // UUIDs in dev, while older mockups used box-* ids.
    const boxHit = findBoxById(groupBoxesByOwner(boxesQuery.data ?? []), trimmed)
    if (boxHit) {
      openBox(boxHit.box)
      return
    }

    const runnerHit = runnersQuery.data?.find((runner) => runner.id.toLowerCase().includes(trimmed))
    if (runnerHit) {
      setHighlightRunner(runnerHit.id)
      setView('fleet')
    }
  }

  const jumpToOwner = (ownerName: string) => {
    setRunnerFilter(null)
    setQuery(ownerName)
    setView('people')
  }

  const jumpToRunner = (runnerId: string) => {
    setDrawerOpen(false)
    setQuery('')
    setRunnerFilter(null)
    setHighlightRunner(runnerId)
    setView('fleet')
  }

  const showRunnerBoxes = (runnerId: string) => {
    setQuery('')
    setRunnerFilter(runnerId)
    setView('people')
  }

  const recoverBox = (boxId: string) => {
    recover.mutate(boxId)
    setDrawerOpen(false)
  }

  return (
    <PageLayout>
      <PageHeader size="full">
        <PageTitle>Admin</PageTitle>
      </PageHeader>

      <PageContent size="full">
        {/* toolbar: view switch + global search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-card p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm transition-colors',
                  view === v.id ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.label}
                <span className={cn('text-[10px]', view === v.id ? 'text-primary' : 'text-muted-foreground/60')}>
                  {v.hint}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search users, boxes, runners…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="mt-6">
          {view === 'overview' && <AdminOverviewView onJumpToOwner={jumpToOwner} onJumpToRunner={jumpToRunner} />}
          {view === 'people' && (
            <AdminPeopleBoxesView
              query={query}
              runnerFilter={runnerFilter}
              onClearRunnerFilter={() => setRunnerFilter(null)}
              onOpenBox={openBox}
            />
          )}
          {view === 'fleet' && (
            <AdminFleetView query={query} highlightRunnerId={highlightRunner} onShowRunnerBoxes={showRunnerBoxes} />
          )}
        </div>
      </PageContent>

      <AdminTelemetryDrawer
        box={selectedBox}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onRecover={recoverBox}
        onJumpToRunner={jumpToRunner}
      />
    </PageLayout>
  )
}

export default Admin
