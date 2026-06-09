/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
  validate: jest.fn(() => true),
}))

import { SandboxStartAction } from './sandbox-start.action'
import { SandboxAction, SYNC_AGAIN } from './sandbox.action'
import { Sandbox } from '../../entities/sandbox.entity'
import { Runner } from '../../entities/runner.entity'
import { SandboxState } from '../../enums/sandbox-state.enum'
import { SandboxDesiredState } from '../../enums/sandbox-desired-state.enum'
import { RunnerState } from '../../enums/runner-state.enum'
import { LockCode } from '../../common/redis-lock.provider'

describe('SandboxStartAction.handleRunnerSandboxStoppedStateOnDesiredStateStart', () => {
  it('restarts a stopped sandbox on its own runner (no cross-runner reassignment)', async () => {
    const ownRunnerId = 'runner-own-1'

    const sandbox = new Sandbox('region-1', 'my-sandbox')
    sandbox.runnerId = ownRunnerId
    sandbox.state = SandboxState.STOPPED
    sandbox.desiredState = SandboxDesiredState.STARTED
    sandbox.pending = true

    const ownRunner = { id: ownRunnerId, state: RunnerState.READY } as Runner

    // findOneOrFail must return the runner that matches the requested id so we can
    // prove the action selected sandbox.runnerId and nothing else.
    const runnerService = {
      findOneOrFail: jest.fn(async (id: string) => {
        if (id !== ownRunnerId) {
          throw new Error(`unexpected runner lookup: ${id}`)
        }
        return ownRunner
      }),
    }

    // Capture the runner the action chose to start the sandbox on.
    let runnerUsedForStart: Runner | undefined
    const startSandbox = jest.fn(async () => undefined)
    const runnerAdapterFactory = {
      create: jest.fn(async (runner: Runner) => {
        runnerUsedForStart = runner
        return { startSandbox } as any
      }),
    }

    const lockCode = new LockCode('lock-1')
    const updatedFields: Partial<Sandbox>[] = []
    const sandboxRepository = {
      update: jest.fn(async (_id: string, opts: { updateData: Partial<Sandbox> }) => {
        updatedFields.push(opts.updateData)
        return sandbox
      }),
    }
    const redisLockProvider = {
      getCode: jest.fn(async () => lockCode),
    }
    const organizationService = {
      findOne: jest.fn(async () => ({ sandboxMetadata: {} })),
    }

    const action = new SandboxStartAction(
      runnerService as any,
      runnerAdapterFactory as any,
      sandboxRepository as any,
      {} as any, // boxTemplateService
      organizationService as any,
      {} as any, // configService
      redisLockProvider as any,
      {} as any, // sandboxActivityService
    )

    const result = await (action as SandboxAction).run(sandbox, lockCode)

    // The action started the sandbox on its OWN runner, not a different one.
    expect(runnerUsedForStart?.id).toBe(ownRunnerId)
    expect(startSandbox).toHaveBeenCalledWith(sandbox.id, sandbox.authToken, expect.any(Object))
    // findOneOrFail was only ever asked about the sandbox's own runner.
    for (const call of runnerService.findOneOrFail.mock.calls) {
      expect(call[0]).toBe(ownRunnerId)
    }
    expect(result).toBe(SYNC_AGAIN)
    expect(updatedFields.some((u) => u.state === SandboxState.STARTING)).toBe(true)
  })

  it('moves a stopped sandbox with no runner to ERROR (cross-runner recovery is not supported)', async () => {
    const sandbox = new Sandbox('region-1', 'orphan-sandbox')
    sandbox.runnerId = null
    sandbox.state = SandboxState.STOPPED
    sandbox.desiredState = SandboxDesiredState.STARTED
    sandbox.pending = true

    const runnerService = { findOneOrFail: jest.fn() }
    const runnerAdapterFactory = { create: jest.fn() }
    const lockCode = new LockCode('lock-2')
    const updatedFields: Partial<Sandbox>[] = []
    const sandboxRepository = {
      update: jest.fn(async (_id: string, opts: { updateData: Partial<Sandbox> }) => {
        updatedFields.push(opts.updateData)
        return sandbox
      }),
    }
    const redisLockProvider = { getCode: jest.fn(async () => lockCode) }
    const organizationService = { findOne: jest.fn(async () => ({ sandboxMetadata: {} })) }

    const action = new SandboxStartAction(
      runnerService as any,
      runnerAdapterFactory as any,
      sandboxRepository as any,
      {} as any,
      organizationService as any,
      {} as any,
      redisLockProvider as any,
      {} as any,
    )

    await (action as SandboxAction).run(sandbox, lockCode)

    // No runner lookup or adapter creation: there is no runner to recover onto.
    expect(runnerService.findOneOrFail).not.toHaveBeenCalled()
    expect(runnerAdapterFactory.create).not.toHaveBeenCalled()
    expect(updatedFields.some((u) => u.state === SandboxState.ERROR)).toBe(true)
  })
})
