/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

export interface SystemEnvironmentDefinition {
  name: string
  imageName: string
  displayName: string
  description: string
}

export const SYSTEM_ENVIRONMENTS: SystemEnvironmentDefinition[] = [
  {
    name: 'ubuntu:24.04',
    imageName: 'ubuntu:24.04',
    displayName: 'Ubuntu 24.04 LTS',
    description: 'General-purpose Linux environment',
  },
  {
    name: 'debian:13-slim',
    imageName: 'debian:13-slim',
    displayName: 'Debian 13 slim',
    description: 'Small Debian-based environment',
  },
  {
    name: 'alpine:3.23',
    imageName: 'alpine:3.23',
    displayName: 'Alpine 3.23',
    description: 'Minimal Linux environment',
  },
]

export function getSystemEnvironmentDefinition(imageNameOrName: string): SystemEnvironmentDefinition | undefined {
  return SYSTEM_ENVIRONMENTS.find(
    (environment) => environment.imageName === imageNameOrName || environment.name === imageNameOrName,
  )
}

export function getSystemEnvironmentSortIndex(imageNameOrName: string): number {
  const index = SYSTEM_ENVIRONMENTS.findIndex(
    (environment) => environment.imageName === imageNameOrName || environment.name === imageNameOrName,
  )

  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}
