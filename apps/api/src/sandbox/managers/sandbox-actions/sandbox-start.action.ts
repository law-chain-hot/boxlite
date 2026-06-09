/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { SandboxRepository } from '../../repositories/sandbox.repository'
import { RECOVERY_ERROR_SUBSTRINGS } from '../../constants/errors-for-recovery'
import { Sandbox } from '../../entities/sandbox.entity'
import { SandboxState } from '../../enums/sandbox-state.enum'
import { DONT_SYNC_AGAIN, SandboxAction, SYNC_AGAIN, SyncState } from './sandbox.action'
import { RunnerArtifactCacheState } from '../../enums/runner-artifact-cache-state.enum'
import { BackupState } from '../../enums/backup-state.enum'
import { RunnerState } from '../../enums/runner-state.enum'
import { BoxTemplateService } from '../../services/box-template.service'
import { DockerRegistryService } from '../../../docker-registry/services/docker-registry.service'
import { DockerRegistry } from '../../../docker-registry/entities/docker-registry.entity'
import { RunnerService } from '../../services/runner.service'
import { RunnerAdapterFactory } from '../../runner-adapter/runnerAdapter'
import { RuntimeArtifactStateError } from '../../errors/runtime-artifact-state-error'
import { BoxTemplate } from '../../entities/box-template.entity'
import { OrganizationService } from '../../../organization/services/organization.service'
import { TypedConfigService } from '../../../config/typed-config.service'
import { Runner } from '../../entities/runner.entity'
import { Organization } from '../../../organization/entities/organization.entity'
import { LockCode, RedisLockProvider } from '../../common/redis-lock.provider'
import { InjectRedis } from '@nestjs-modules/ioredis'
import Redis from 'ioredis'
import { WithSpan } from '../../../common/decorators/otel.decorator'
import { SandboxActivityService } from '../../services/sandbox-activity.service'

@Injectable()
export class SandboxStartAction extends SandboxAction {
  protected readonly logger = new Logger(SandboxStartAction.name)
  constructor(
    protected runnerService: RunnerService,
    protected runnerAdapterFactory: RunnerAdapterFactory,
    protected sandboxRepository: SandboxRepository,
    protected readonly boxTemplateService: BoxTemplateService,
    protected readonly dockerRegistryService: DockerRegistryService,
    protected readonly organizationService: OrganizationService,
    protected readonly configService: TypedConfigService,
    protected readonly redisLockProvider: RedisLockProvider,
    @InjectRedis() private readonly redis: Redis,
    private readonly sandboxActivityService: SandboxActivityService,
  ) {
    super(runnerService, runnerAdapterFactory, sandboxRepository, redisLockProvider)
  }

  @WithSpan()
  async run(sandbox: Sandbox, lockCode: LockCode): Promise<SyncState> {
    switch (sandbox.state) {
      case SandboxState.PULLING_ARTIFACT: {
        if (!sandbox.runnerId) {
          // Using the PULLING_ARTIFACT state for the case where the runner isn't assigned yet as well
          return this.handleUnassignedRunnerSandbox(sandbox, lockCode)
        } else {
          return this.handleRunnerSandboxStartedStateCheck(sandbox, lockCode)
        }
      }
      case SandboxState.UNKNOWN: {
        return this.handleRunnerSandboxUnknownStateOnDesiredStateStart(sandbox, lockCode)
      }
      case SandboxState.STOPPED: {
        return this.handleRunnerSandboxStoppedStateOnDesiredStateStart(sandbox, lockCode)
      }
      case SandboxState.RESTORING:
      case SandboxState.CREATING:
      case SandboxState.STARTING: {
        return this.handleRunnerSandboxStartedStateCheck(sandbox, lockCode)
      }
      case SandboxState.ERROR: {
        this.logger.error(`Sandbox ${sandbox.id} is in error state on desired state start`)
        return DONT_SYNC_AGAIN
      }
    }

    return DONT_SYNC_AGAIN
  }

  private async handleUnassignedRunnerSandbox(sandbox: Sandbox, lockCode: LockCode): Promise<SyncState> {
    const template = await this.boxTemplateService.getBoxTemplateByName(sandbox.template, sandbox.organizationId)
    const artifactRef = template.artifactRef

    // Try to assign an available runner with the artifact already available
    try {
      const runner = await this.runnerService.getRandomAvailableRunner({
        regions: [sandbox.region],
        sandboxClass: sandbox.class,
        artifactRef: artifactRef,
      })
      if (runner) {
        await this.updateSandboxState(sandbox, SandboxState.UNKNOWN, lockCode, runner.id)
        return SYNC_AGAIN
      }
    } catch {
      // Continue to next assignment method
    }

    // Try to assign an available runner that is currently processing the artifact
    const runnerArtifactCaches = await this.runnerService.getRunnerArtifactCaches(artifactRef)

    for (const runnerArtifactCache of runnerArtifactCaches) {
      // Consider removing the runner usage rate check or improving it
      const runner = await this.runnerService.findOneOrFail(runnerArtifactCache.runnerId)

      if (runnerArtifactCache.state === RunnerArtifactCacheState.ERROR) {
        await this.updateSandboxState(sandbox, SandboxState.ERROR, lockCode, runner.id, runnerArtifactCache.errorReason)
        return DONT_SYNC_AGAIN
      }

      if (runner.unschedulable || runner.draining || runner.state !== RunnerState.READY) {
        continue
      }

      if (runnerArtifactCache.state === RunnerArtifactCacheState.PULLING_ARTIFACT) {
        await this.updateSandboxState(sandbox, SandboxState.PULLING_ARTIFACT, lockCode, runner.id)
        return SYNC_AGAIN
      }
    }

    const excludedRunnerIds = await this.runnerService.getRunnersWithMultipleArtifactsPulling()

    // Try to assign an available runner to start processing the artifact
    let runner: Runner

    try {
      runner = await this.runnerService.getRandomAvailableRunner({
        regions: [sandbox.region],
        sandboxClass: sandbox.class,
        excludedRunnerIds: excludedRunnerIds,
      })
    } catch {
      // TODO: reconsider the timeout here
      // No runners available, wait for 3 seconds and retry
      await new Promise((resolve) => setTimeout(resolve, 3000))
      return SYNC_AGAIN
    }

    await this.runnerService.createRunnerArtifactCacheEntry(
      runner.id,
      template.artifactRef,
      RunnerArtifactCacheState.PULLING_ARTIFACT,
    )
    this.pullTemplateArtifactToRunner(template, runner)
    await this.updateSandboxState(sandbox, SandboxState.PULLING_ARTIFACT, lockCode, runner.id)

    return SYNC_AGAIN
  }

  async pullTemplateArtifactToRunner(template: BoxTemplate, runner: Runner) {
    const internalRegistry = await this.dockerRegistryService.findInternalRegistryByArtifactRef(
      template.artifactRef,
      runner.region,
    )
    if (!internalRegistry) {
      throw new Error('No internal registry found for sandbox artifact')
    }

    const runnerAdapter = await this.runnerAdapterFactory.create(runner)

    // Fire the pull request (runner returns 202 immediately)
    await runnerAdapter.pullArtifact(template.artifactRef, internalRegistry)

    const pollTimeoutMs = 60 * 60 * 1_000 // 1 hour
    const pollIntervalMs = 5 * 1_000 // 5 seconds
    const startTime = Date.now()

    while (Date.now() - startTime < pollTimeoutMs) {
      try {
        await runnerAdapter.getArtifactInfo(template.artifactRef)
        return
      } catch (err) {
        if (err instanceof RuntimeArtifactStateError) {
          throw err
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }

  private async handleRunnerSandboxUnknownStateOnDesiredStateStart(
    sandbox: Sandbox,
    lockCode: LockCode,
  ): Promise<SyncState> {
    const runner = await this.runnerService.findOneOrFail(sandbox.runnerId)
    if (runner.state !== RunnerState.READY) {
      return DONT_SYNC_AGAIN
    }

    const organization = await this.organizationService.findOne(sandbox.organizationId)

    const runnerAdapter = await this.runnerAdapterFactory.create(runner)

    const template = await this.boxTemplateService.getBoxTemplateByName(sandbox.template, sandbox.organizationId)
    const artifactRef = template.artifactRef

    const internalRegistry = await this.dockerRegistryService.findInternalRegistryByArtifactRef(
      artifactRef,
      runner.region,
    )
    if (!internalRegistry) {
      throw new Error('No registry found for artifact')
    }

    const entrypoint = template.entrypoint

    const metadata = {
      ...organization?.sandboxMetadata,
      sandboxName: sandbox.name,
    }

    const result = await runnerAdapter.createSandbox(
      sandbox,
      artifactRef,
      internalRegistry,
      entrypoint,
      metadata,
      this.configService.get('sandboxOtel.endpointUrl'),
    )

    await this.updateSandboxState(sandbox, SandboxState.CREATING, lockCode, undefined, undefined, result?.daemonVersion)
    //  sync states again immediately for sandbox
    return SYNC_AGAIN
  }

  private async handleRunnerSandboxStoppedStateOnDesiredStateStart(
    sandbox: Sandbox,
    lockCode: LockCode,
  ): Promise<SyncState> {
    const organization = await this.organizationService.findOne(sandbox.organizationId)

    //  check if sandbox is assigned to a runner and if that runner is unschedulable
    //  if it is, move sandbox to prevRunnerId, and set runnerId to null
    //  this will assign a new runner to the sandbox and restore the sandbox from the latest backup
    if (sandbox.runnerId) {
      const runner = await this.runnerService.findOneOrFail(sandbox.runnerId)
      const originalRunnerId = sandbox.runnerId // Store original value

      const startScoreThreshold = this.configService.get('runnerScore.thresholds.start') || 0

      const shouldMoveToNewRunner =
        (runner.unschedulable || runner.state != RunnerState.READY || runner.availabilityScore < startScoreThreshold) &&
        sandbox.backupState === BackupState.COMPLETED

      // if the runner is unschedulable/not ready and sandbox has a valid backup, move sandbox to a new runner
      if (shouldMoveToNewRunner) {
        sandbox.prevRunnerId = originalRunnerId
        sandbox.runnerId = null

        await this.sandboxRepository.update(
          sandbox.id,
          {
            updateData: {
              prevRunnerId: originalRunnerId,
              runnerId: null,
            },
          },
          true,
        )
      }

      // If the sandbox is on a runner and its backupState is COMPLETED
      // but there are too many running sandboxes on that runner, move it to a less used runner
      if (sandbox.backupState === BackupState.COMPLETED) {
        if (runner.availabilityScore < this.configService.getOrThrow('runnerScore.thresholds.availability')) {
          const availableRunners = await this.runnerService.findAvailableRunners({
            regions: [sandbox.region],
            sandboxClass: sandbox.class,
          })
          const lessUsedRunners = availableRunners.filter((runner) => runner.id !== originalRunnerId)

          //  temp workaround to move sandboxes to less used runner
          if (lessUsedRunners.length > 0) {
            sandbox.prevRunnerId = originalRunnerId
            sandbox.runnerId = null

            await this.sandboxRepository.update(
              sandbox.id,
              {
                updateData: {
                  prevRunnerId: originalRunnerId,
                  runnerId: null,
                },
              },
              true,
            )
            try {
              const runnerAdapter = await this.runnerAdapterFactory.create(runner)
              await runnerAdapter.destroySandbox(sandbox.id)
            } catch (e) {
              if (e.response?.status !== 404 && e.statusCode !== 404) {
                this.logger.error(`Failed to cleanup sandbox ${sandbox.id} on previous runner ${runner.id}:`, e)
              }
            }
          }
        }
      }
    }

    if (sandbox.runnerId === null) {
      //  if sandbox has no runner, check if backup is completed
      //  if not, set sandbox to error
      //  if backup is completed, get random available runner and start sandbox
      //  use the backup to start the sandbox

      if (sandbox.backupState !== BackupState.COMPLETED) {
        await this.updateSandboxState(
          sandbox,
          SandboxState.ERROR,
          lockCode,
          undefined,
          'Sandbox has no runner and backup is not completed',
        )
        return DONT_SYNC_AGAIN
      }

      const syncCheck = await this.restoreSandboxOnNewRunner(sandbox, lockCode, organization, sandbox.prevRunnerId)
      if (syncCheck !== null) {
        return syncCheck
      }
    } else {
      // if sandbox has runner, start sandbox
      const runner = await this.runnerService.findOneOrFail(sandbox.runnerId)

      if (runner.state !== RunnerState.READY) {
        return DONT_SYNC_AGAIN
      }

      const runnerAdapter = await this.runnerAdapterFactory.create(runner)

      const metadata: { [key: string]: string } = { ...organization?.sandboxMetadata }
      if (sandbox.volumes?.length) {
        metadata['volumes'] = JSON.stringify(
          sandbox.volumes.map((v) => ({ volumeId: v.volumeId, mountPath: v.mountPath, subpath: v.subpath })),
        )
      }

      try {
        await runnerAdapter.startSandbox(sandbox.id, sandbox.authToken, metadata)
      } catch (error) {
        // Check against a list of substrings that should trigger an automatic recovery
        if (error?.message) {
          const matchesRecovery = RECOVERY_ERROR_SUBSTRINGS.some((substring) =>
            error.message.toLowerCase().includes(substring.toLowerCase()),
          )
          if (matchesRecovery) {
            try {
              await this.restoreSandboxOnNewRunner(sandbox, lockCode, organization, sandbox.runnerId, true)
              this.logger.warn(`Sandbox ${sandbox.id} transferred to a new runner`)
              return SYNC_AGAIN
            } catch (restoreError) {
              this.logger.warn(`Sandbox ${sandbox.id} recovery attempt failed:`, restoreError.message)
            }
          }
        }
        throw error
      }

      await this.updateSandboxState(sandbox, SandboxState.STARTING, lockCode)
      return SYNC_AGAIN
    }

    return SYNC_AGAIN
  }

  //  used to check if sandbox is started on runner and update sandbox state accordingly
  //  also used to handle the case where a sandbox is started on a runner and then transferred to a new runner
  private async handleRunnerSandboxStartedStateCheck(sandbox: Sandbox, lockCode: LockCode): Promise<SyncState> {
    //  edge case when sandbox is being transferred to a new runner
    if (!sandbox.runnerId) {
      return SYNC_AGAIN
    }

    const runner = await this.runnerService.findOneOrFail(sandbox.runnerId)

    const runnerAdapter = await this.runnerAdapterFactory.create(runner)
    const sandboxInfo = await runnerAdapter.sandboxInfo(sandbox.id)

    switch (sandboxInfo.state) {
      case SandboxState.STARTED: {
        //  if previous backup state is error or completed, set backup state to none
        if ([BackupState.ERROR, BackupState.COMPLETED].includes(sandbox.backupState)) {
          await this.updateSandboxState(
            sandbox,
            SandboxState.STARTED,
            lockCode,
            undefined,
            undefined,
            sandboxInfo.daemonVersion,
            BackupState.NONE,
          )
          return DONT_SYNC_AGAIN
        } else {
          await this.updateSandboxState(
            sandbox,
            SandboxState.STARTED,
            lockCode,
            undefined,
            undefined,
            sandboxInfo.daemonVersion,
          )

          //  if sandbox was transferred to a new runner, remove it from the old runner
          if (sandbox.prevRunnerId) {
            await this.removeSandboxFromPreviousRunner(sandbox)
          }

          return DONT_SYNC_AGAIN
        }
      }
      case SandboxState.STARTING:
        if (await this.checkTimeoutError(sandbox, 5, 'Timeout while starting sandbox')) {
          return DONT_SYNC_AGAIN
        }
        break
      case SandboxState.RESTORING:
        if (await this.checkTimeoutError(sandbox, 30, 'Timeout while starting sandbox')) {
          return DONT_SYNC_AGAIN
        }
        break
      case SandboxState.CREATING: {
        if (await this.checkTimeoutError(sandbox, 15, 'Timeout while creating sandbox')) {
          return DONT_SYNC_AGAIN
        }
        break
      }
      case SandboxState.UNKNOWN: {
        await this.updateSandboxState(sandbox, SandboxState.UNKNOWN, lockCode)
        break
      }
      case SandboxState.ERROR: {
        await this.updateSandboxState(
          sandbox,
          SandboxState.ERROR,
          lockCode,
          undefined,
          'Sandbox entered error state on runner during startup wait loop',
        )
        break
      }
      case SandboxState.PULLING_ARTIFACT: {
        if (await this.checkTimeoutError(sandbox, 30, 'Timeout while pulling artifact')) {
          return DONT_SYNC_AGAIN
        }
        await this.updateSandboxState(sandbox, SandboxState.PULLING_ARTIFACT, lockCode)
        break
      }
      case SandboxState.DESTROYED: {
        this.logger.warn(
          `Sandbox ${sandbox.id} is in destroyed state while starting on runner ${sandbox.runnerId}, prev runner ${sandbox.prevRunnerId}`,
        )
        await this.checkTimeoutError(
          sandbox,
          15,
          'Timeout while starting sandbox: Sandbox is in unknown state on runner',
        )
        return DONT_SYNC_AGAIN
      }
      // also any other state that is not STARTED
      default: {
        this.logger.error(`Sandbox ${sandbox.id} is in unexpected state ${sandboxInfo.state}`)
        await this.updateSandboxState(
          sandbox,
          SandboxState.ERROR,
          lockCode,
          undefined,
          `Sandbox is in unexpected state: ${sandboxInfo.state}`,
        )
        break
      }
    }

    return SYNC_AGAIN
  }

  private async checkTimeoutError(sandbox: Sandbox, timeoutMinutes: number, errorReason: string): Promise<boolean> {
    const lastActivityAt = await this.sandboxActivityService.getLastActivityAt(sandbox.id)
    if (lastActivityAt && lastActivityAt.getTime() < Date.now() - 1000 * 60 * timeoutMinutes) {
      const updateData: Partial<Sandbox> = {
        state: SandboxState.ERROR,
        errorReason,
        recoverable: false,
      }
      await this.sandboxRepository.update(sandbox.id, { updateData, entity: sandbox })
      return true
    }
    return false
  }

  private async restoreSandboxOnNewRunner(
    sandbox: Sandbox,
    lockCode: LockCode,
    organization: Organization,
    excludedRunnerId: string,
    isRecovery?: boolean,
  ): Promise<SyncState | null> {
    let lockKey: string | null = null

    // Recovery lock to prevent frequent automatic restore attempts
    if (isRecovery) {
      lockKey = `sandbox-${sandbox.id}-restored-cooldown`
      const sixHoursInSeconds = 6 * 60 * 60
      const acquired = await this.redisLockProvider.lock(lockKey, sixHoursInSeconds)
      if (!acquired) {
        return null
      }
    }

    if (!sandbox.backupRegistryId) {
      throw new Error('No registry found for backup')
    }

    const registry = await this.dockerRegistryService.findOne(sandbox.backupRegistryId)
    if (!registry) {
      throw new Error('No registry found for backup')
    }

    //  make sure we pick a runner that has the base template artifact
    let baseTemplate: BoxTemplate | null = null
    if (sandbox.template) {
      try {
        baseTemplate = await this.boxTemplateService.getBoxTemplateByName(sandbox.template, sandbox.organizationId)
      } catch (e) {
        if (e instanceof NotFoundException) {
          //  if the base template is not found, we'll use any available runner later
        } else {
          if (isRecovery) {
            return SYNC_AGAIN
          }
          //  for all other errors, throw them
          throw e
        }
      }
    }

    const artifactRef = baseTemplate ? baseTemplate.artifactRef : null

    let availableRunners: Runner[] = []

    const excludedRunnerIds: string[] = excludedRunnerId ? [excludedRunnerId] : []

    const runnersWithBaseArtifact: Runner[] = artifactRef
      ? await this.runnerService.findAvailableRunners({
          regions: [sandbox.region],
          sandboxClass: sandbox.class,
          artifactRef,
          excludedRunnerIds,
        })
      : []
    if (runnersWithBaseArtifact.length > 0) {
      availableRunners = runnersWithBaseArtifact
    } else {
      //  if no runner has the base artifact, get all available runners
      availableRunners = await this.runnerService.findAvailableRunners({
        regions: [sandbox.region],
        excludedRunnerIds,
      })
    }

    //  check if we have any available runners after filtering
    if (availableRunners.length === 0) {
      // Sync state again later. Runners are unavailable
      if (isRecovery) {
        await this.redisLockProvider.unlock(lockKey)
      }
      return DONT_SYNC_AGAIN
    }

    //  get random runner from available runners
    const randomRunnerIndex = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min)
    const runner = availableRunners[randomRunnerIndex(0, availableRunners.length - 1)]

    //  verify the runner is still available and ready
    if (!runner || runner.state !== RunnerState.READY || runner.unschedulable) {
      this.logger.warn(`Selected runner ${runner?.id || 'null'} is no longer available, retrying sandbox assignment`)
      if (isRecovery) {
        await this.redisLockProvider.unlock(lockKey)
      }
      return SYNC_AGAIN
    }

    const runnerAdapter = await this.runnerAdapterFactory.create(runner)

    const existingBackups = sandbox.existingBackupSnapshots
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((existingSnapshot) => existingSnapshot.snapshotName)

    let validBackup: string | null = null
    let exists = false

    for (const existingBackup of existingBackups) {
      try {
        if (!validBackup && sandbox.backupSnapshot) {
          //  last snapshot is the current snapshot, so we don't need to check it
          //  just in case, we'll use the value from the backupSnapshot property
          validBackup = sandbox.backupSnapshot
        } else {
          validBackup = existingBackup
        }

        if (!validBackup) {
          continue
        }

        await runnerAdapter.inspectArtifactInRegistry(validBackup, registry)
        exists = true
        break
      } catch (error) {
        this.logger.error(`Failed to check if backup snapshot ${validBackup} exists in registry ${registry.id}:`, error)
      }
    }

    const restoreBackupSnapshotRetryKey = `restore-backup-snapshot-retry-${sandbox.id}`
    if (!exists) {
      if (!isRecovery) {
        // Check retry count - allow up to 3 attempts for transient issues
        const retryCountRaw = await this.redis.get(restoreBackupSnapshotRetryKey)
        const retryCount = retryCountRaw ? parseInt(retryCountRaw) : 0

        if (retryCount < 3) {
          // Increment retry count with 10 minute TTL, let syncStates cron pick up the retry later
          await this.redis.setex(restoreBackupSnapshotRetryKey, 600, String(retryCount + 1))
          this.logger.warn(
            `No valid backup snapshot found for sandbox ${sandbox.id}, retry attempt ${retryCount + 1}/3`,
          )
          return DONT_SYNC_AGAIN
        }

        // After 3 retries, error out and clear the retry counter
        await this.redis.del(restoreBackupSnapshotRetryKey)
        await this.updateSandboxState(
          sandbox,
          SandboxState.ERROR,
          lockCode,
          undefined,
          'No valid backup snapshot found',
        )
      } else {
        throw new Error('No valid backup snapshot found')
      }
      return SYNC_AGAIN
    }

    // Clear the retry counter on success
    await this.redis.del(restoreBackupSnapshotRetryKey)

    await this.updateSandboxState(sandbox, SandboxState.RESTORING, lockCode, runner.id)

    const metadata = {
      ...organization?.sandboxMetadata,
      sandboxName: sandbox.name,
    }

    await runnerAdapter.createSandbox(
      sandbox,
      validBackup,
      registry,
      undefined,
      metadata,
      this.configService.get('sandboxOtel.endpointUrl'),
    )
    return null
  }

  private async removeSandboxFromPreviousRunner(sandbox: Sandbox): Promise<void> {
    const runner = await this.runnerService.findOne(sandbox.prevRunnerId)
    if (!runner) {
      this.logger.warn(`Previously assigned runner ${sandbox.prevRunnerId} for sandbox ${sandbox.id} not found`)

      await this.sandboxRepository.update(sandbox.id, { updateData: { prevRunnerId: null } }, true)
      return
    }

    const runnerAdapter = await this.runnerAdapterFactory.create(runner)

    try {
      // First try to destroy the sandbox
      await runnerAdapter.destroySandbox(sandbox.id)
    } catch (error) {
      if (error.response?.status !== 404 && error.statusCode !== 404) {
        this.logger.error(`Failed to cleanup sandbox ${sandbox.id} on previous runner ${runner.id}:`, error)
        throw error
      }
    }

    await this.sandboxRepository.update(sandbox.id, { updateData: { prevRunnerId: null } }, true)
  }
}
