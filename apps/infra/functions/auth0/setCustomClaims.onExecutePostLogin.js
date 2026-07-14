/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

exports.onExecutePostLogin = async (event, api) => {
  if (event.user.email_verified !== true) {
    api.access.deny('Please verify your email address before continuing.')
    return
  }

  if (!event.authorization) {
    return
  }

  api.accessToken.setCustomClaim('email_verified', true)
  api.accessToken.setCustomClaim('email', event.user.email)
  api.accessToken.setCustomClaim('name', event.user.name)
}
