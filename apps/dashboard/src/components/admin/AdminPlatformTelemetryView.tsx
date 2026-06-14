/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { LogsTab, MetricsTab, TracesTab } from '@/components/telemetry'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import React from 'react'

const AdminPlatformTelemetryView: React.FC = () => {
  return (
    <div className="space-y-3">
      <Tabs
        defaultValue="metrics"
        className="flex min-h-[40rem] flex-col overflow-hidden rounded-md border bg-background/80 shadow-sm"
      >
        <TabsList variant="underline" className="gap-10 bg-muted/35 px-5">
          <TabsTrigger
            value="metrics"
            className="gap-2 px-0 py-3.5 data-[state=active]:border-primary data-[state=active]:text-primary"
          >
            <span className="text-sm font-semibold">Metrics</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-normal text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>live</span>
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="gap-2 px-0 py-3.5 data-[state=active]:border-primary data-[state=active]:text-primary"
          >
            <span className="text-sm font-semibold">Logs</span>
            <span className="text-[11px] font-normal text-muted-foreground">4</span>
          </TabsTrigger>
          <TabsTrigger
            value="traces"
            className="gap-2 px-0 py-3.5 data-[state=active]:border-primary data-[state=active]:text-primary"
          >
            <span className="text-sm font-semibold">Traces</span>
            <span className="text-[11px] font-normal text-muted-foreground">4</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="metrics" className="m-0 min-h-0 flex-1 overflow-hidden">
          <MetricsTab scope="admin-platform" />
        </TabsContent>
        <TabsContent value="logs" className="m-0 min-h-0 flex-1 overflow-hidden">
          <LogsTab scope="admin-platform" />
        </TabsContent>
        <TabsContent value="traces" className="m-0 min-h-0 flex-1 overflow-hidden">
          <TracesTab scope="admin-platform" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default AdminPlatformTelemetryView
