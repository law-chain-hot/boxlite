/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { LocalStorageKey } from '@/enums/LocalStorageKey'
import { getLocalStorageItem, setLocalStorageItem } from './local-storage'

export const ONBOARDING_PROGRESS_EVENT = 'boxlite:onboarding-progress'

export interface OnboardingProgress {
  boxCreated?: boolean
  terminalOpened?: boolean
  lifecycleSeen?: boolean
  developerOpened?: boolean
}

const emptyProgress: OnboardingProgress = {}

export function getOnboardingProgressKey(userId?: string) {
  return userId ? `${LocalStorageKey.OnboardingProgressPrefix}${userId}` : null
}

export function readOnboardingProgress(userId?: string): OnboardingProgress {
  const key = getOnboardingProgressKey(userId)
  if (!key) return emptyProgress

  const raw = getLocalStorageItem(key)
  if (!raw) return emptyProgress

  try {
    const parsed = JSON.parse(raw) as OnboardingProgress
    return {
      boxCreated: Boolean(parsed.boxCreated),
      terminalOpened: Boolean(parsed.terminalOpened),
      lifecycleSeen: Boolean(parsed.lifecycleSeen),
      developerOpened: Boolean(parsed.developerOpened),
    }
  } catch {
    return emptyProgress
  }
}

export function mergeOnboardingProgress(userId: string | undefined, update: OnboardingProgress): OnboardingProgress {
  const key = getOnboardingProgressKey(userId)
  const nextProgress = { ...readOnboardingProgress(userId), ...update }

  if (key) {
    setLocalStorageItem(key, JSON.stringify(nextProgress))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ONBOARDING_PROGRESS_EVENT, { detail: nextProgress }))
    }
  }

  return nextProgress
}

export function getOnboardingCoreProgress(progress: OnboardingProgress) {
  const completed =
    Number(Boolean(progress.boxCreated)) +
    Number(Boolean(progress.terminalOpened)) +
    Number(Boolean(progress.lifecycleSeen))

  return {
    completed,
    total: 3,
    isComplete: completed === 3,
  }
}
