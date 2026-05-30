/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  getSystemEnvironmentDefinition,
  getSystemEnvironmentSortIndex,
  SYSTEM_ENVIRONMENTS,
} from './system-environments'

describe('system-environments', () => {
  it('exposes only MVP Linux base images in the intended order', () => {
    expect(SYSTEM_ENVIRONMENTS.map((environment) => environment.imageName)).toEqual([
      'ubuntu:24.04',
      'debian:13-slim',
      'alpine:3.23',
    ])
  })

  it('maps image tags to user-facing labels and descriptions', () => {
    expect(getSystemEnvironmentDefinition('ubuntu:24.04')).toMatchObject({
      displayName: 'Ubuntu 24.04 LTS',
      description: 'General-purpose Linux environment',
    })
    expect(getSystemEnvironmentDefinition('debian:13-slim')).toMatchObject({
      displayName: 'Debian 13 slim',
      description: 'Small Debian-based environment',
    })
    expect(getSystemEnvironmentDefinition('alpine:3.23')).toMatchObject({
      displayName: 'Alpine 3.23',
      description: 'Minimal Linux environment',
    })
  })

  it('provides a stable sort order for known images', () => {
    expect(
      ['alpine:3.23', 'ubuntu:24.04', 'debian:13-slim'].sort(
        (a, b) => getSystemEnvironmentSortIndex(a) - getSystemEnvironmentSortIndex(b),
      ),
    ).toEqual(['ubuntu:24.04', 'debian:13-slim', 'alpine:3.23'])
  })
})
