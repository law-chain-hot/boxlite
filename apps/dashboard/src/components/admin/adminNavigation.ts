/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

export type AdminView = 'overview' | 'people' | 'fleet' | 'platformTelemetry'

export const ADMIN_VIEWS: { id: AdminView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'people', label: 'People & Boxes' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'platformTelemetry', label: 'Platform Telemetry' },
]
