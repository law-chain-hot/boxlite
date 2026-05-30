/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createBoxToCreateSandbox, resolveBoxEnvironmentId } from './sandbox-to-box.mapper'

describe('sandbox-to-box mapper', () => {
  it('maps SDK image tags to approved system environments', () => {
    expect(resolveBoxEnvironmentId('ubuntu:24.04')).toBe('ubuntu:24.04')
    expect(resolveBoxEnvironmentId('debian:13-slim')).toBe('debian:13-slim')
    expect(resolveBoxEnvironmentId('alpine:3.23')).toBe('alpine:3.23')
  })

  it('uses the default Linux environment when the SDK omits image', () => {
    expect(createBoxToCreateSandbox({ name: 'my-box' }).environmentId).toBe('ubuntu:24.04')
  })

  it('leaves unsupported images unresolved so the controller can reject them', () => {
    expect(createBoxToCreateSandbox({ image: 'node:22' }).environmentId).toBeUndefined()
  })
})
