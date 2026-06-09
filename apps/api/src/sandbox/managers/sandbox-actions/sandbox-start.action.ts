/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { SandboxRepository } from '../../repositories/sandbox.repository'
import { Sandbox } from '../../entities/sandbox.entity'
import { SandboxState } from '../../enums/sandbox-state.enum'
import { DONT_SYNC_AGAIN, SandboxAction, SYNC_AGAIN, SyncState } from './sandbox.action'
import { RunnerArtifactCacheState } from '../../enums/runner-artifact-cache-state.enum'
import { RunnerState } from '../../enums/runner-state.enum'
import { BoxTemplateService } from '../../services/box-template.service'
import { RunnerService } from '../../services/runner.service'
import { RunnerAdapterFactory } from '../../runner-adapter/runnerAdapter'
import { RuntimeArtifactStateError } from '../../errors/runtime-artifact-state-error'
import { BoxTemplate } from '../../entities/box-template.entity'
import { OrganizationService } from '../../../organization/services/organization.service'
import { TypedConfigService } from '../../../config/typed-config.service'
import { Runner } from '../../entities/runner.entity'
import { LockCode, RedisLockProvider } from '../../common/redis-lock.provider'
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
    protected readonly organizationService: OrganizationService,
    protected readonly configService: TypedConfigService,
    protected readonly redisLockProvider: RedisLockProvider,
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
    const runnerAdapter = await this.runnerAdapterFactory.create(runner)

    // Fire the pull request (runner returns 202 immediately).
    // The runner pulls the ghcr ref directly using its runtime-scoped ghcr auth.
    await runnerAdapter.pullArtifact(template.artifactRef, undefined)

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

    const entrypoint = template.entrypoint

    const metadata = {
      ...organization?.sandboxMetadata,
      sandboxName: sandbox.name,
    }

    // The runner pulls the ghcr ref directly using its runtime-scoped ghcr auth.
    const result = await runnerAdapter.createSandbox(
      sandbox,
      artifactRef,
      undefined,
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

    //  A stopped sandbox restarts on its own runner. Cross-runner recovery is not supported.
    if (sandbox.runnerId === null) {
      await this.updateSandboxState(sandbox, SandboxState.ERROR, lockCode, undefined, 'Sandbox has no runner')
      return DONT_SYNC_AGAIN
    }

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

    await runnerAdapter.startSandbox(sandbox.id, sandbox.authToken, metadata)

    await this.updateSandboxState(sandbox, SandboxState.STARTING, lockCode)
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
