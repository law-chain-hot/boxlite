/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { type AdminBox, isErrorState } from '@/components/admin/adminHelpers'
import AdminPlatformTelemetryView from '@/components/admin/AdminPlatformTelemetryView'
import { AdminStateBadge } from '@/components/admin/AdminPrimitives'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContent, PageHeader, PageLayout, PageTitle } from '@/components/PageLayout'
import { RoutePath } from '@/enums/RoutePath'
import { useApi } from '@/hooks/useApi'
import { handleApiError } from '@/lib/error-handling'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Wrench } from 'lucide-react'
import React from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

function MetaRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t pt-2 first:border-t-0 first:pt-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 max-w-[70%] truncate text-right font-medium">{children}</dd>
    </div>
  )
}

const AdminBoxTelemetry: React.FC = () => {
  const { boxId } = useParams<{ boxId: string }>()
  const navigate = useNavigate()
  const { axiosInstance } = useApi()
  const queryClient = useQueryClient()

  const boxesQuery = useQuery<AdminBox[]>({
    queryKey: ['admin', 'boxes'],
    queryFn: () => axiosInstance.get('/admin/overview/boxes').then((r) => r.data),
    enabled: !!boxId,
  })

  const recoverMutation = useMutation({
    mutationFn: (sandboxId: string) => axiosInstance.post(`/admin/sandbox/${sandboxId}/recover`),
    onSuccess: () => {
      toast.success('Sandbox recovery initiated')
      queryClient.invalidateQueries({ queryKey: ['admin', 'boxes'] })
    },
    onError: (error) => handleApiError(error, 'Failed to recover sandbox'),
  })

  if (!boxId) {
    return <Navigate to={RoutePath.ADMIN} replace />
  }

  if (boxesQuery.isError && (boxesQuery.error as { response?: { status?: number } })?.response?.status === 403) {
    return <Navigate to={RoutePath.DASHBOARD} replace />
  }

  const box = boxesQuery.data?.find((item) => item.id === boxId)

  return (
    <PageLayout>
      <PageHeader size="full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(RoutePath.ADMIN)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <PageTitle>Platform telemetry</PageTitle>
          </div>
        </div>
      </PageHeader>

      <PageContent size="full">
        {boxesQuery.isPending ? (
          <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
            <Skeleton className="h-80 rounded-md" />
            <Skeleton className="h-[40rem] rounded-md" />
          </div>
        ) : !box ? (
          <Card>
            <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Box not found.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
            <Card className="h-fit">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="truncate font-mono text-base">{box.id}</CardTitle>
                  <AdminStateBadge state={box.state} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="space-y-2 text-sm">
                  <MetaRow k="owner">{box.owner.name}</MetaRow>
                  <MetaRow k="org">{box.owner.personal ? 'personal' : box.owner.orgName}</MetaRow>
                  <MetaRow k="runner">
                    <span className="font-mono text-xs">{box.runnerId ?? '—'}</span>
                  </MetaRow>
                  <MetaRow k="specs">
                    <span className="font-mono text-xs">
                      {box.cpu}c / {box.memoryGiB}G
                    </span>
                  </MetaRow>
                  <MetaRow k="created">
                    <span className="text-xs">{new Date(box.createdAt).toLocaleString()}</span>
                  </MetaRow>
                </dl>

                <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  The evidence on this page is platform-scoped. It is opened from this box, but it is not this box's
                  runtime telemetry.
                </p>

                {isErrorState(box.state) && (
                  <Button size="sm" onClick={() => recoverMutation.mutate(box.id)}>
                    <Wrench className="h-4 w-4" />
                    Recover
                  </Button>
                )}
              </CardContent>
            </Card>

            <AdminPlatformTelemetryView contextBox={box} />
          </div>
        )}
      </PageContent>
    </PageLayout>
  )
}

export default AdminBoxTelemetry
