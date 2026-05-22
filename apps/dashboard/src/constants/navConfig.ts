/**
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

// MVP 减法:主导航只留 Boxes。隐藏项代码保留,翻 true 即恢复(见 brian-notes Task4 ADR-001)。
export const NAV = {
  primary: {
    boxes: true,
    snapshots: false,
    registries: false,
    volumes: false,
    auditLogs: false,
  },
} as const
