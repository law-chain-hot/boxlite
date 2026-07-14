/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

async function loadAction() {
  const source = await readFile(new URL('./setCustomClaims.onExecutePostLogin.js', import.meta.url), 'utf8')
  const sandbox = { exports: {} }

  vm.runInNewContext(source, sandbox, {
    filename: 'setCustomClaims.onExecutePostLogin.js',
  })

  return sandbox.exports.onExecutePostLogin
}

function createApi() {
  const claims = new Map()
  const denied = []

  return {
    api: {
      access: {
        deny: (message) => denied.push(message),
      },
      accessToken: {
        setCustomClaim: (name, value) => claims.set(name, value),
      },
    },
    claims,
    denied,
  }
}

test('denies unverified users before issuing BoxLite claims', async () => {
  const onExecutePostLogin = await loadAction()
  const { api, claims, denied } = createApi()

  await onExecutePostLogin(
    {
      authorization: {},
      user: {
        email_verified: false,
        email: 'unverified@boxlite.dev',
        name: 'Unverified User',
      },
    },
    api,
  )

  assert.deepEqual(denied, ['Please verify your email address before continuing.'])
  assert.equal(claims.size, 0)
})

test('adds BoxLite access token claims for verified users', async () => {
  const onExecutePostLogin = await loadAction()
  const { api, claims, denied } = createApi()

  await onExecutePostLogin(
    {
      authorization: {},
      user: {
        email_verified: true,
        email: 'verified@boxlite.dev',
        name: 'Verified User',
      },
    },
    api,
  )

  assert.deepEqual(denied, [])
  assert.deepEqual(Object.fromEntries(claims), {
    email_verified: true,
    email: 'verified@boxlite.dev',
    name: 'Verified User',
  })
})

test('skips access token claims when the login has no API authorization context', async () => {
  const onExecutePostLogin = await loadAction()
  const { api, claims, denied } = createApi()

  await onExecutePostLogin(
    {
      user: {
        email_verified: true,
        email: 'verified@boxlite.dev',
        name: 'Verified User',
      },
    },
    api,
  )

  assert.deepEqual(denied, [])
  assert.equal(claims.size, 0)
})
