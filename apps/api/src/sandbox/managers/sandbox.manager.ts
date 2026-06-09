/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { randomUUID } from 'crypto'

import { SandboxConflictError } from '../errors/sandbox-conflict.error'
import { JobConflictError } from '../errors/job-conflict.error'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'
import { RunnerService } from '../services/runner.service'

import { RedisLockProvider, LockCode } from '../common/redis-lock.provider'

import { SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION } from '../constants/sandbox.constants'

import { SandboxEvents } from '../constants/sandbox-events.constants'
import { SandboxStoppedEvent } from '../events/sandbox-stopped.event'
import { SandboxStartedEvent } from '../events/sandbox-started.event'
import { SandboxDestroyedEvent } from '../events/sandbox-destroyed.event'
import { SandboxCreatedEvent } from '../events/sandbox-create.event'

import { WithInstrumentation, WithSpan } from '../../common/decorators/otel.decorator'

import { SandboxStartAction } from './sandbox-actions/sandbox-start.action'
import { SandboxStopAction } from './sandbox-actions/sandbox-stop.action'
import { SandboxDestroyAction } from './sandbox-actions/sandbox-destroy.action'
import { SYNC_AGAIN, DONT_SYNC_AGAIN } from './sandbox-actions/sandbox.action'

import { TrackJobExecution } from '../../common/decorators/track-job-execution.decorator'
import { TrackableJobExecutions } from '../../common/interfaces/trackable-job-executions'
import { setTimeout } from 'timers/promises'
import { LogExecution } from '../../common/decorators/log-execution.decorator'
import { SandboxRepository } from '../repositories/sandbox.repository'
import { getStateChangeLockKey } from '../utils/lock-key.util'
import { OnAsyncEvent } from '../../common/decorators/on-async-event.decorator'
import { sanitizeSandboxError } from '../utils/sanitize-error.util'
import { Sandbox } from '../entities/sandbox.entity'

@Injectable()
export class SandboxManager implements TrackableJobExecutions, OnApplicationShutdown {
  activeJobs = new Set<string>()

  private readonly logger = new Logger(SandboxManager.name)

  constructor(
    private readonly sandboxRepository: SandboxRepository,
    private readonly runnerService: RunnerService,
    private readonly redisLockProvider: RedisLockProvider,
    private readonly sandboxStartAction: SandboxStartAction,
    private readonly sandboxStopAction: SandboxStopAction,
    private readonly sandboxDestroyAction: SandboxDestroyAction,
  ) {}

  async onApplicationShutdown() {
    //  wait for all active jobs to finish
    while (this.activeJobs.size > 0) {
      this.logger.log(`Waiting for ${this.activeJobs.size} active jobs to finish`)
      await setTimeout(1000)
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'auto-stop-check' })
  @TrackJobExecution()
  @WithInstrumentation()
  @LogExecution('auto-stop-check')
  @WithInstrumentation()
  async autostopCheck(): Promise<void> {
    const lockKey = 'auto-stop-check-worker-selected'
    //  lock the sync to only run one instance at a time
    if (!(await this.redisLockProvider.lock(lockKey, 60))) {
      return
    }

    try {
      const readyRunners = await this.runnerService.findAllReady()

      // Process all runners in parallel
      await Promise.all(
        readyRunners.map(async (runner) => {
          const sandboxes = await this.sandboxRepository
            .createQueryBuilder('sandbox')
            .innerJoin('sandbox_last_activity', 'activity', 'activity."sandboxId" = sandbox.id')
            .where('sandbox."runnerId" = :runnerId', { runnerId: runner.id })
            .andWhere('sandbox."organizationId" != :warmPoolOrg', {
              warmPoolOrg: SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION,
            })
            .andWhere('sandbox.state = :state', { state: SandboxState.STARTED })
            .andWhere('sandbox."desiredState" = :desiredState', {
              desiredState: SandboxDesiredState.STARTED,
            })
            .andWhere('sandbox.pending != true')
            .andWhere('sandbox."autoStopInterval" != 0')
            .andWhere('activity."lastActivityAt" < NOW() - INTERVAL \'1 minute\' * sandbox."autoStopInterval"')
            .limit(100)
            .getMany()

          await Promise.all(
            sandboxes.map(async (sandbox) => {
              const lockKey = getStateChangeLockKey(sandbox.id)
              const acquired = await this.redisLockProvider.lock(lockKey, 30)
              if (!acquired) {
                return
              }

              let updateData: Partial<Sandbox> = {}

              //  if auto-delete interval is 0, delete the sandbox immediately
              if (sandbox.autoDeleteInterval === 0) {
                updateData = Sandbox.getSoftDeleteUpdate(sandbox)
              } else {
                updateData.pending = true
                updateData.desiredState = SandboxDesiredState.STOPPED
              }

              this.logger.log(
                `Auto-stopping sandbox ${sandbox.id}: autoStopInterval=${sandbox.autoStopInterval}min, autoDeleteInterval=${sandbox.autoDeleteInterval}`,
              )

              try {
                await this.sandboxRepository.updateWhere(sandbox.id, {
                  updateData,
                  whereCondition: { pending: false, state: sandbox.state },
                })

                this.syncInstanceState(sandbox.id).catch(this.logger.error)
              } catch (error) {
                this.logger.error(`Error processing auto-stop state for sandbox ${sandbox.id}:`, error)
              } finally {
                await this.redisLockProvider.unlock(lockKey)
              }
            }),
          )
        }),
      )
    } finally {
      await this.redisLockProvider.unlock(lockKey)
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'auto-delete-check' })
  @TrackJobExecution()
  @LogExecution('auto-delete-check')
  @WithInstrumentation()
  async autoDeleteCheck(): Promise<void> {
    const lockKey = 'auto-delete-check-worker-selected'
    //  lock the sync to only run one instance at a time
    if (!(await this.redisLockProvider.lock(lockKey, 60))) {
      return
    }

    try {
      const readyRunners = await this.runnerService.findAllReady()

      // Process all runners in parallel
      await Promise.all(
        readyRunners.map(async (runner) => {
          const sandboxes = await this.sandboxRepository
            .createQueryBuilder('sandbox')
            .innerJoin('sandbox_last_activity', 'activity', 'activity."sandboxId" = sandbox.id')
            .where('sandbox."runnerId" = :runnerId', { runnerId: runner.id })
            .andWhere('sandbox."organizationId" != :warmPoolOrg', {
              warmPoolOrg: SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION,
            })
            .andWhere('sandbox.state = :state', { state: SandboxState.STOPPED })
            .andWhere('sandbox."desiredState" = :desiredState', {
              desiredState: SandboxDesiredState.STOPPED,
            })
            .andWhere('sandbox.pending != true')
            .andWhere('sandbox."autoDeleteInterval" >= 0')
            .andWhere('activity."lastActivityAt" < NOW() - INTERVAL \'1 minute\' * sandbox."autoDeleteInterval"')
            .orderBy('activity."lastActivityAt"', 'ASC')
            .limit(100)
            .getMany()

          await Promise.all(
            sandboxes.map(async (sandbox) => {
              const lockKey = getStateChangeLockKey(sandbox.id)
              const acquired = await this.redisLockProvider.lock(lockKey, 30)
              if (!acquired) {
                return
              }

              this.logger.log(
                `Auto-deleting sandbox ${sandbox.id}: autoDeleteInterval=${sandbox.autoDeleteInterval}min`,
              )

              try {
                const updateData = Sandbox.getSoftDeleteUpdate(sandbox)
                await this.sandboxRepository.updateWhere(sandbox.id, {
                  updateData,
                  whereCondition: { pending: false, state: sandbox.state },
                })

                this.syncInstanceState(sandbox.id).catch(this.logger.error)
              } catch (error) {
                this.logger.error(`Error processing auto-delete state for sandbox ${sandbox.id}:`, error)
              } finally {
                await this.redisLockProvider.unlock(lockKey)
              }
            }),
          )
        }),
      )
    } finally {
      await this.redisLockProvider.unlock(lockKey)
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'sync-states' })
  @TrackJobExecution()
  @WithInstrumentation()
  @LogExecution('sync-states')
  async syncStates(): Promise<void> {
    const globalLockKey = 'sync-states'
    const lockTtl = 10 * 60 // seconds (10 min)
    if (!(await this.redisLockProvider.lock(globalLockKey, lockTtl))) {
      return
    }

    try {
      const queryBuilder = this.sandboxRepository
        .createQueryBuilder('sandbox')
        .select(['sandbox.id'])
        .leftJoin('sandbox_last_activity', 'activity', 'activity."sandboxId" = sandbox.id')
        .where('sandbox.state NOT IN (:...excludedStates)', {
          excludedStates: [SandboxState.DESTROYED, SandboxState.ERROR, SandboxState.RESIZING],
        })
        .andWhere('sandbox."desiredState"::text != sandbox.state::text')
        .andWhere('sandbox."desiredState"::text IN (:...supportedDesiredStates)', {
          supportedDesiredStates: [
            SandboxDesiredState.STARTED,
            SandboxDesiredState.STOPPED,
            SandboxDesiredState.DESTROYED,
          ],
        })
        .orderBy('activity."lastActivityAt"', 'DESC', 'NULLS LAST')

      const stream = await queryBuilder.stream()
      let processedCount = 0
      const maxProcessPerRun = 1000
      const pendingProcesses: Promise<void>[] = []

      try {
        await new Promise<void>((resolve, reject) => {
          stream.on('data', async (row: any) => {
            if (processedCount >= maxProcessPerRun) {
              resolve()
              return
            }

            const lockKey = getStateChangeLockKey(row.sandbox_id)
            if (await this.redisLockProvider.isLocked(lockKey)) {
              // Sandbox is already being processed, skip it
              return
            }

            // Process sandbox asynchronously but track the promise
            const processPromise = this.syncInstanceState(row.sandbox_id).catch((err) => {
              this.logger.error(`Error syncing sandbox state for ${row.sandbox_id}`, err)
            })
            pendingProcesses.push(processPromise)
            processedCount++

            // Limit concurrent processing to avoid overwhelming the system
            if (pendingProcesses.length >= 10) {
              stream.pause()
              Promise.allSettled(pendingProcesses.splice(0, pendingProcesses.length))
                .then(() => stream.resume())
                .catch(reject)
            }
          })

          stream.on('end', () => {
            Promise.allSettled(pendingProcesses)
              .then(() => {
                resolve()
              })
              .catch(reject)
          })

          stream.on('error', reject)
        })
      } finally {
        if (!stream.destroyed) {
          stream.destroy()
        }
      }
    } finally {
      await this.redisLockProvider.unlock(globalLockKey)
    }
  }

  /**
   * Sync the state of a sandbox.
   *
   * Loop to handle SYNC_AGAIN without releasing the lock or re-fetching.
   * The sandbox entity is mutated in-place by repository.update() on each iteration,
   * and the lock guarantees no concurrent modification.
   */
  async syncInstanceState(sandboxId: string, force?: boolean): Promise<void> {
    // Track the start time of the sync operation.
    const startedAt = new Date()

    // Generate a random lock code to prevent race condition if sandbox action continues after the lock expires.
    const lockCode = new LockCode(randomUUID())

    // Prevent syncState cron from running multiple instances of the same sandbox.
    const lockKey = getStateChangeLockKey(sandboxId)
    const acquired = await this.redisLockProvider.lock(lockKey, 30, lockCode)
    if (!acquired) {
      return
    }

    try {
      const sandbox = await this.sandboxRepository.findOneOrFail({
        where: { id: sandboxId },
      })

      while (new Date().getTime() - startedAt.getTime() <= 10000) {
        if (
          [SandboxState.DESTROYED, SandboxState.RESIZING].includes(sandbox.state) ||
          sandbox.state === SandboxState.ERROR
        ) {
          // Break sync loop if sandbox reaches a terminal state.
          break
        }

        if (String(sandbox.state) === String(sandbox.desiredState)) {
          this.logger.warn(
            `Sandbox ${sandboxId} is already in the desired state ${sandbox.desiredState}, skipping sync`,
          )
          // Break sync loop if sandbox is already in the desired state.
          break
        }

        // Rely on the sandbox action to return SYNC_AGAIN or DONT_SYNC_AGAIN to continue/break the sync loop.
        let syncState = DONT_SYNC_AGAIN

        try {
          switch (sandbox.desiredState) {
            case SandboxDesiredState.STARTED: {
              syncState = await this.sandboxStartAction.run(sandbox, lockCode)
              break
            }
            case SandboxDesiredState.STOPPED: {
              syncState = await this.sandboxStopAction.run(sandbox, lockCode, force)
              break
            }
            case SandboxDesiredState.DESTROYED: {
              syncState = await this.sandboxDestroyAction.run(sandbox, lockCode)
              break
            }
          }
        } catch (error) {
          if (error instanceof SandboxConflictError) {
            this.logger.warn(
              `Sandbox ${sandboxId} was modified by another operation during sync, skipping error transition`,
            )
            break
          }

          if (error instanceof JobConflictError) {
            this.logger.debug(`Job already in progress for sandbox ${sandboxId}, skipping`)
            break
          }

          this.logger.error(`Error processing desired state for sandbox ${sandboxId}:`, error)

          const { recoverable, errorReason } = sanitizeSandboxError(error)

          const updateData: Partial<Sandbox> = {
            state: SandboxState.ERROR,
            errorReason,
            recoverable,
          }

          // Update sandbox to error state without safeguards
          await this.sandboxRepository.updateWhere(sandboxId, { updateData, whereCondition: {} })

          // Break sync loop since sandbox is in error state.
          break
        }

        // Do not sync again for v2 runners
        // Job completion will update the sandbox state
        if (sandbox.runnerId && (await this.runnerService.getRunnerApiVersion(sandbox.runnerId)) === '2') {
          break
        }

        // Break sync loop if sandbox action returned DONT_SYNC_AGAIN.
        if (syncState !== SYNC_AGAIN) {
          break
        }
      }
    } finally {
      await this.redisLockProvider.unlock(lockKey)
    }
  }

  @OnAsyncEvent({
    event: SandboxEvents.DESTROYED,
  })
  @TrackJobExecution()
  @WithSpan()
  private async handleSandboxDestroyedEvent(event: SandboxDestroyedEvent) {
    await this.syncInstanceState(event.sandbox.id)
  }

  @OnAsyncEvent({
    event: SandboxEvents.STARTED,
  })
  @TrackJobExecution()
  @WithSpan()
  private async handleSandboxStartedEvent(event: SandboxStartedEvent) {
    await this.syncInstanceState(event.sandbox.id)
  }

  @OnAsyncEvent({
    event: SandboxEvents.STOPPED,
  })
  @TrackJobExecution()
  @WithSpan()
  private async handleSandboxStoppedEvent(event: SandboxStoppedEvent) {
    await this.syncInstanceState(event.sandbox.id, event.force)
  }

  @OnAsyncEvent({
    event: SandboxEvents.CREATED,
  })
  @TrackJobExecution()
  @WithSpan()
  private async handleSandboxCreatedEvent(event: SandboxCreatedEvent) {
    await this.syncInstanceState(event.sandbox.id)
  }
}
