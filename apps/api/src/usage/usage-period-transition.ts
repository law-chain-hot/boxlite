/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { EntityManager, IsNull } from 'typeorm'
import { Box } from '../box/entities/box.entity'
import { UsagePeriodKind, planUsageTransition, usagePeriodKind } from './metering/usage-period-math'
import { UsagePeriod } from './entities/usage-period.entity'

interface UsageTransitionLogger {
  warn(message: string): void
}

export async function applyUsagePeriodTransition(
  entityManager: EntityManager,
  box: Box,
  now: Date,
  logger?: UsageTransitionLogger,
): Promise<void> {
  const open = await entityManager.findOne(UsagePeriod, {
    where: { boxId: box.id, endAt: IsNull() },
    lock: { mode: 'pessimistic_write' },
  })

  if (open && now.getTime() < open.startAt.getTime()) {
    logger?.warn(
      `ignoring stale usage transition for box ${box.id}: ${now.toISOString()} before ${open.startAt.toISOString()}`,
    )
    return
  }

  const nextKind = usagePeriodKind(box.state, box.desiredState)
  const plan = planUsageTransition(open?.kind ?? null, box.state, box.desiredState)
  const resourcesChanged =
    Boolean(open) && nextKind !== 'gone' && open?.kind === nextKind && !usagePeriodMatchesBox(open, box, nextKind)

  if ((plan.closeOpen || resourcesChanged) && open) {
    open.endAt = now
    await entityManager.save(UsagePeriod, open)
  }

  const openKindToCreate = plan.openKind ?? (resourcesChanged ? (nextKind as UsagePeriodKind) : null)
  if (openKindToCreate) {
    await entityManager.save(
      UsagePeriod,
      entityManager.create(UsagePeriod, createUsagePeriodInput(box, openKindToCreate, now)),
    )
  }
}

export function createUsagePeriodInput(box: Box, kind: UsagePeriodKind, startAt: Date): Partial<UsagePeriod> {
  const running = kind === 'running'
  return {
    boxId: box.id,
    organizationId: box.organizationId,
    region: box.region,
    startAt,
    endAt: null,
    kind,
    cpu: running ? box.cpu : 0,
    mem: running ? box.mem : 0,
    gpu: running ? box.gpu : 0,
    disk: box.disk,
    actualCpuSeconds: null,
    actualRssAvgBytes: null,
    actualRssPeakBytes: null,
    sampleCount: null,
  }
}

export function usagePeriodMatchesBox(period: UsagePeriod, box: Box, kind: UsagePeriodKind): boolean {
  const running = kind === 'running'
  return (
    period.organizationId === box.organizationId &&
    period.region === box.region &&
    period.cpu === (running ? box.cpu : 0) &&
    period.mem === (running ? box.mem : 0) &&
    period.gpu === (running ? box.gpu : 0) &&
    period.disk === box.disk
  )
}
