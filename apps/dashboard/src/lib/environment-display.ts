/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

export interface EnvironmentDisplayMetadata {
  displayName: string
  description: string
}

const LINUX_BASE_ENVIRONMENTS: Record<string, EnvironmentDisplayMetadata> = {
  'ubuntu:24.04': {
    displayName: 'Ubuntu 24.04 LTS',
    description: 'General-purpose Linux environment',
  },
  'debian:13-slim': {
    displayName: 'Debian 13 slim',
    description: 'Small Debian-based environment',
  },
  'alpine:3.23': {
    displayName: 'Alpine 3.23',
    description: 'Minimal Linux environment',
  },
}

const LINUX_BASE_ENVIRONMENT_ORDER = Object.keys(LINUX_BASE_ENVIRONMENTS)

export function getEnvironmentDisplayMetadata(imageNameOrName?: string): EnvironmentDisplayMetadata | undefined {
  if (!imageNameOrName) {
    return undefined
  }

  return LINUX_BASE_ENVIRONMENTS[imageNameOrName]
}

export function getEnvironmentDisplayName(imageNameOrName?: string): string {
  if (!imageNameOrName) {
    return '-'
  }

  return getEnvironmentDisplayMetadata(imageNameOrName)?.displayName ?? imageNameOrName
}

export function getEnvironmentDisplaySortIndex(imageNameOrName?: string): number {
  if (!imageNameOrName) {
    return Number.MAX_SAFE_INTEGER
  }

  const index = LINUX_BASE_ENVIRONMENT_ORDER.indexOf(imageNameOrName)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}
