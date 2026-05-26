/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { LogsTab, MetricsTab, TracesTab } from '@/components/telemetry'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import React from 'react'
import { type AdminBox } from './adminHelpers'
import { AdminSectionFrame, AdminStateBadge } from './AdminPrimitives'

interface AdminPlatformTelemetryViewProps {
  contextBox?: AdminBox | null
}

const PLATFORM_TELEMETRY_TARGET = 'boxlite-api'

const AdminPlatformTelemetryView: React.FC<AdminPlatformTelemetryViewProps> = ({ contextBox }) => {
  return (
    <div className="space-y-4">
      <AdminSectionFrame
        title="Platform Telemetry"
        description="Global boxlite-api logs, traces, and runtime metrics from ClickHouse."
        contentClassName="space-y-3"
      >
        <div className="grid gap-3 text-sm text-muted-foreground lg:grid-cols-[1fr_auto] lg:items-center">
          <p>
            This evidence is platform-scoped. It is useful for control-plane incidents and API debugging, but it is not
            per-box runtime telemetry.
          </p>
          <div className="rounded-md border border-border bg-background/70 px-3 py-2 font-mono text-xs text-foreground">
            service.name={PLATFORM_TELEMETRY_TARGET}
          </div>
        </div>

        {contextBox && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Opened from</span>
              <span className="font-mono text-xs">{contextBox.id}</span>
              <AdminStateBadge state={contextBox.state} />
            </div>
          </div>
        )}
      </AdminSectionFrame>

      <Tabs defaultValue="traces" className="flex min-h-[40rem] flex-col rounded-md border bg-card">
        <TabsList variant="underline" className="justify-start rounded-none border-b px-4">
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="m-0 min-h-0 flex-1 overflow-hidden">
          <LogsTab scope="admin-platform" />
        </TabsContent>
        <TabsContent value="traces" className="m-0 min-h-0 flex-1 overflow-hidden">
          <TracesTab scope="admin-platform" />
        </TabsContent>
        <TabsContent value="metrics" className="m-0 min-h-0 flex-1 overflow-hidden">
          <MetricsTab scope="admin-platform" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default AdminPlatformTelemetryView
