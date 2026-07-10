#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { chromium } from 'playwright-core'

const { Pool } = pg

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptsRoot, '..', '..')
const apiUrl = stripTrailingSlash(process.env.BOXLITE_E2E_API_URL || 'http://localhost:3001/api')
const dashboardUrl = stripTrailingSlash(process.env.BOXLITE_E2E_BASE_URL || 'http://localhost:3000')
const loginEmail = process.env.BOXLITE_E2E_LOGIN_EMAIL || 'admin@boxlite.dev'
const loginPassword = process.env.BOXLITE_E2E_LOGIN_PASSWORD || 'password'
const timeoutMs = Number(process.env.BILLING_E2E_TIMEOUT_MS || 240_000)
const chromeExecutablePath =
  process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const artifactsDir = process.env.BILLING_E2E_ARTIFACTS || path.join(repoRoot, '.apps-local', 'logs')
const apiKeyValue =
  process.env.BILLING_E2E_API_KEY ||
  `blk_test_billinge2e${Date.now().toString(36)}${crypto.randomBytes(12).toString('hex')}`
const apiKeyName = 'billing-local-e2e'
const archiveId = crypto.randomUUID()
const sourcePeriodId = crypto.randomUUID()
const boxId = `bill${crypto.randomBytes(4).toString('hex')}`

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 25432),
  user: process.env.DB_USERNAME || 'boxlite',
  password: process.env.DB_PASSWORD || 'boxlite',
  database: process.env.DB_DATABASE || 'boxlite',
  max: 4,
})

let organizationId
let userId
let walletBefore
let walletCreated = false

try {
  await fs.mkdir(artifactsDir, { recursive: true })
  ;({ organizationId, userId } = await ensureApiKey())
  await ensureWallet()
  await waitForQuietWindow()
  walletBefore = await loadWallet()
  const usageBefore = await fetchBilling('usage')

  await seedArchivedUsage()
  const settled = await waitForSettlement()
  const walletAfter = await loadWallet()
  const walletView = await fetchBilling('wallet')
  const usageAfter = await fetchBilling('usage')

  verifySettlement(settled, walletAfter, walletView, usageBefore, usageAfter)
  await verifyDashboard(walletView)

  console.log(
    JSON.stringify(
      {
        ok: true,
        organizationId,
        boxId,
        archiveId,
        preciseCents: settled.preciseCents,
        debitedCents: -Number(settled.amountCents),
        currentBalanceCents: walletView.ongoingBalanceCents,
        spentThisMonthCents: walletView.balanceCents - walletView.ongoingBalanceCents,
        screenshot: path.join(artifactsDir, 'billing-local-e2e.png'),
        mobileScreenshot: path.join(artifactsDir, 'billing-local-e2e-mobile.png'),
      },
      null,
      2,
    ),
  )
} finally {
  await cleanup().catch((error) => {
    console.warn(`billing cleanup warning: ${error.message}`)
  })
  await pool.end().catch(() => {})
}

async function ensureApiKey() {
  const { rows } = await pool.query(
    `
      select u.id as "userId", ou."organizationId" as "organizationId"
      from "user" u
      join organization_user ou on ou."userId" = u.id
      where u.email = $1 and ou.role = 'owner'
      limit 1
    `,
    [loginEmail],
  )
  if (rows.length === 0) {
    throw new Error(`No owner organization found for ${loginEmail}`)
  }

  const row = rows[0]
  await pool.query('delete from api_key where "organizationId" = $1 and "userId" = $2 and name = $3', [
    row.organizationId,
    row.userId,
    apiKeyName,
  ])
  await pool.query(
    `
      insert into api_key (
        "organizationId", "userId", name, "keyHash", "keyPrefix", "keySuffix", permissions, "createdAt"
      ) values ($1, $2, $3, $4, $5, $6, ARRAY[]::api_key_permissions_enum[], now())
    `,
    [
      row.organizationId,
      row.userId,
      apiKeyName,
      hashApiKey(apiKeyValue),
      displayPrefix(apiKeyValue),
      apiKeyValue.slice(-3),
    ],
  )

  return row
}

async function ensureWallet() {
  const existing = await pool.query('select id from wallet where "organizationId" = $1', [organizationId])
  if (existing.rows.length > 0) {
    return
  }

  walletCreated = true
  await fetchBilling('wallet')
}

async function loadWallet() {
  const { rows } = await pool.query(
    `
      select id, "freeBalanceCents", "paidBalanceCents", "settlementRemainderCents", "billingStatus"
      from wallet
      where "organizationId" = $1
    `,
    [organizationId],
  )
  if (rows.length !== 1) {
    throw new Error(`Expected one wallet for ${organizationId}, got ${rows.length}`)
  }
  return rows[0]
}

async function waitForQuietWindow() {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      `
        select
          coalesce((
            select max(extract(epoch from (now() - up."startAt")))
            from usage_period up
            where up."organizationId" = $1 and up."endAt" is null
          ), 0) as "maxOpenAgeSeconds",
          (
            select count(*)
            from usage_period_archive ua
            left join rated_period rp on rp."usagePeriodArchiveId" = ua.id
            where ua."organizationId" = $1 and rp.id is null
          ) as "unratedCount",
          (
            select count(*)
            from rated_period rp
            left join wallet_transaction wt on wt."ratedPeriodId" = rp.id
            where rp."organizationId" = $1 and wt.id is null
          ) as "undebitedCount"
      `,
      [organizationId],
    )
    const state = rows[0]
    // Leave at least 90 seconds before this org's next five-minute rollover.
    if (
      Number(state.maxOpenAgeSeconds) < 210 &&
      Number(state.unratedCount) === 0 &&
      Number(state.undebitedCount) === 0
    ) {
      return
    }
    await delay(500)
  }
  throw new Error('Billing organization did not reach a quiet settlement window')
}

async function seedArchivedUsage() {
  const endAt = new Date(Date.now() - 1_000)
  const startAt = new Date(endAt.getTime() - 60 * 60 * 1000)
  await pool.query(
    `
      insert into usage_period_archive (
        id, "sourcePeriodId", "boxId", "organizationId", region,
        "startAt", "endAt", kind, cpu, gpu, mem, disk,
        "actualCpuSeconds", "actualRssAvgBytes", "actualRssPeakBytes", "sampleCount"
      ) values ($1, $2, $3, $4, 'local', $5, $6, 'running', 2, 0, 4, 10, null, null, null, null)
    `,
    [archiveId, sourcePeriodId, boxId, organizationId, startAt, endAt],
  )
}

async function waitForSettlement() {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      `
        select rp.id as "ratedPeriodId", rp."preciseCents", rp."ratedCents", wt."amountCents"
        from rated_period rp
        join wallet_transaction wt on wt."ratedPeriodId" = rp.id
        where rp."usagePeriodArchiveId" = $1
      `,
      [archiveId],
    )
    if (rows.length === 1) {
      return rows[0]
    }
    await delay(500)
  }
  throw new Error(`Settlement did not consume usage archive ${archiveId} within ${timeoutMs}ms`)
}

function verifySettlement(settled, walletAfter, walletView, usageBefore, usageAfter) {
  const preciseCents = Number(settled.preciseCents)
  const expectedDebitCents = Math.floor(Number(walletBefore.settlementRemainderCents) + preciseCents)
  const actualDebitCents = -Number(settled.amountCents)
  const beforeBalance = Number(walletBefore.freeBalanceCents) + Number(walletBefore.paidBalanceCents)
  const afterBalance = Number(walletAfter.freeBalanceCents) + Number(walletAfter.paidBalanceCents)

  assertEqual(actualDebitCents, expectedDebitCents, 'usage debit')
  assertEqual(beforeBalance - afterBalance, expectedDebitCents, 'wallet balance delta')
  assertEqual(walletView.ongoingBalanceCents, afterBalance, 'wallet API current balance')
  assertEqual(
    usageAfter.totalAmountCents - usageBefore.totalAmountCents,
    Number(settled.ratedCents),
    'usage API rated delta',
  )
  if (Number(walletAfter.settlementRemainderCents) < 0 || Number(walletAfter.settlementRemainderCents) >= 1) {
    throw new Error(`settlement remainder must stay in [0, 1): ${walletAfter.settlementRemainderCents}`)
  }
}

async function fetchBilling(resource) {
  const response = await fetchWithTimeout(`${apiUrl}/organization/${organizationId}/${resource}`, {
    headers: { Authorization: `Bearer ${apiKeyValue}`, Accept: 'application/json' },
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Billing ${resource} API failed: HTTP ${response.status}: ${body.slice(0, 300)}`)
  }
  return JSON.parse(body)
}

async function verifyDashboard(walletView) {
  const browser = await chromium.launch({ headless: true, executablePath: chromeExecutablePath })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(20_000)
    await signIn(page)
    await page.goto(`${dashboardUrl}/dashboard/billing`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Current balance', { exact: false }).waitFor()

    const expectedBalance = formatCents(walletView.ongoingBalanceCents)
    const expectedSpent = formatCents(walletView.balanceCents - walletView.ongoingBalanceCents)
    if ((await page.locator(`[aria-label="${expectedBalance}"]`).count()) === 0) {
      throw new Error(`Billing UI did not render current balance ${expectedBalance}`)
    }
    if ((await page.locator(`[aria-label="${expectedSpent}"]`).count()) === 0) {
      throw new Error(`Billing UI did not render monthly spend ${expectedSpent}`)
    }
    await page.screenshot({ path: path.join(artifactsDir, 'billing-local-e2e.png'), fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    if (viewport.scrollWidth > viewport.clientWidth) {
      throw new Error(`Billing UI overflows mobile viewport: ${viewport.scrollWidth} > ${viewport.clientWidth}`)
    }
    await page.screenshot({ path: path.join(artifactsDir, 'billing-local-e2e-mobile.png'), fullPage: true })
  } finally {
    await browser.close()
  }
}

async function signIn(page) {
  await page.goto(`${dashboardUrl}/dashboard/billing`, { waitUntil: 'domcontentloaded' })
  await settleAuthState(page)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const login = page.locator('#login')
    if (await login.isVisible().catch(() => false)) {
      await login.fill(loginEmail)
      await page.locator('#password').fill(loginPassword)
      await page.locator('#submit-login').click()
      await settleAuthState(page, { allowDashboardOrigin: true })
      continue
    }

    const grant = page.getByRole('button', { name: 'Grant Access' })
    if (await grant.isVisible().catch(() => false)) {
      await grant.click()
      await settleAuthState(page, { allowDashboardOrigin: true })
      continue
    }
    break
  }

  if (
    await page
      .locator('#login')
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('Dex login is still visible after sign-in attempts')
  }
  if (
    await page
      .getByRole('button', { name: 'Grant Access' })
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('Dex approval is still visible after sign-in attempts')
  }
}

async function settleAuthState(page, { allowDashboardOrigin = false } = {}) {
  const dashboardOrigin = new URL(dashboardUrl).origin
  let dashboardSeenAt = 0
  let lastBodyText = ''

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const currentUrl = page.url()
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '')
    lastBodyText = bodyText
    if (/Log in to Your Account|Grant Access|Billing|Boxes/.test(bodyText)) {
      return
    }
    if (allowDashboardOrigin && currentUrl.startsWith(dashboardOrigin)) {
      dashboardSeenAt ||= Date.now()
      if (Date.now() - dashboardSeenAt > 3_000) {
        return
      }
    } else {
      dashboardSeenAt = 0
    }
    await delay(250)
  }
  throw new Error(`Timed out waiting for dashboard or Dex state at ${page.url()}; body=${lastBodyText.slice(0, 240)}`)
}

async function cleanup() {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `delete from wallet_transaction where "ratedPeriodId" in (
        select id from rated_period where "usagePeriodArchiveId" = $1
      )`,
      [archiveId],
    )
    await client.query('delete from rated_period where "usagePeriodArchiveId" = $1', [archiveId])
    await client.query('delete from usage_period_archive where id = $1', [archiveId])

    if (walletBefore) {
      await client.query(
        `
          update wallet set
            "freeBalanceCents" = $2,
            "paidBalanceCents" = $3,
            "settlementRemainderCents" = $4,
            "billingStatus" = $5
          where id = $1
        `,
        [
          walletBefore.id,
          walletBefore.freeBalanceCents,
          walletBefore.paidBalanceCents,
          walletBefore.settlementRemainderCents,
          walletBefore.billingStatus,
        ],
      )
    }
    if (walletCreated && walletBefore) {
      await client.query('delete from wallet_transaction where "walletId" = $1', [walletBefore.id])
      await client.query('delete from wallet where id = $1', [walletBefore.id])
    }
    if (organizationId && userId) {
      await client.query('delete from api_key where "organizationId" = $1 and "userId" = $2 and name = $3', [
        organizationId,
        userId,
        apiKeyName,
      ])
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function hashApiKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function displayPrefix(value) {
  const first = value.indexOf('_')
  const second = first === -1 ? -1 : value.indexOf('_', first + 1)
  return second === -1 ? value.slice(0, 3) : value.slice(0, second + 1)
}

function formatCents(cents) {
  return (Number(cents) / 100).toFixed(2)
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, '')
}

function assertEqual(actual, expected, label) {
  if (Number(actual) !== Number(expected)) {
    throw new Error(`${label} expected ${expected}, got ${actual}`)
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
