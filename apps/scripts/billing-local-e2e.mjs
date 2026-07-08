#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptsRoot, '..', '..')
const dashboardUrl = stripTrailingSlash(process.env.BOXLITE_E2E_BASE_URL || 'http://localhost:3000')
const loginEmail = process.env.BOXLITE_E2E_LOGIN_EMAIL || 'admin@boxlite.dev'
const loginPassword = process.env.BOXLITE_E2E_LOGIN_PASSWORD || 'password'
const chromeExecutablePath =
  process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const artifactsDir = process.env.BOXLITE_BILLING_E2E_ARTIFACTS || path.join(repoRoot, '.apps-local', 'logs')

await fs.mkdir(artifactsDir, { recursive: true })

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== 'false',
  executablePath: chromeExecutablePath,
})

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  })
  page.setDefaultTimeout(Number(process.env.BOXLITE_E2E_TIMEOUT_MS || 20_000))

  await signIn(page)
  await verifyBillingPage(page)
  await verifyCreateBoxCostEstimate(page)

  console.log(`billing local e2e passed; screenshots in ${artifactsDir}`)
} finally {
  await browser.close()
}

async function signIn(page) {
  await page.goto(`${dashboardUrl}/dashboard/billing`, { waitUntil: 'domcontentloaded' })
  await settleAuthState(page)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await isVisible(page.locator('#login'))) {
      await page.locator('#login').fill(loginEmail)
      await page.locator('#password').fill(loginPassword)
      await page.locator('#submit-login').click()
      await settleAuthState(page, { allowDashboardOrigin: true })
      continue
    }

    const grantButton = page.getByRole('button', { name: 'Grant Access' })
    if (await isVisible(grantButton)) {
      await grantButton.click()
      await settleAuthState(page, { allowDashboardOrigin: true })
      continue
    }

    break
  }

  if (await isVisible(page.locator('#login'))) {
    throw new Error('Dex login is still visible after sign-in attempts')
  }
  if (await isVisible(page.getByRole('button', { name: 'Grant Access' }))) {
    throw new Error('Dex approval is still visible after sign-in attempts')
  }
}

async function verifyBillingPage(page) {
  await page.goto(`${dashboardUrl}/dashboard/billing`, { waitUntil: 'domcontentloaded' })

  await assertBodyText(page, [
    'BILLING',
    'Usage',
    'Billing',
    'Current balance',
    'Spent this month',
    'Billing status',
    'Payment method',
    'Custom range',
    'Usage cost',
    'CONCURRENT CAPACITY · IN USE NOW',
    'PER-BOX MAX & RATE LIMITS',
  ])
  await page.screenshot({ path: path.join(artifactsDir, 'billing-e2e-usage.png'), fullPage: true })

  await page.locator('[role="tab"]').filter({ hasText: /^Billing$/ }).click()
  await assertBodyText(page, ['Auto top-up', 'Top-up', 'ONE-TIME TOP-UP', '$500', 'Receipts', 'Search receipts'])

  await page.getByRole('button', { name: 'Edit' }).click()
  await assertBodyText(page, ['Enable auto top-up', 'When balance below', 'Top up to', 'Save'])
  await page.screenshot({ path: path.join(artifactsDir, 'billing-e2e-auto-top-up.png'), fullPage: true })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '$500', exact: true }).click()
  await assertBodyText(page, ['Confirm top-up', '$500.00', 'via Stripe'])
  await page.screenshot({ path: path.join(artifactsDir, 'billing-e2e-top-up-confirm.png'), fullPage: true })
  await page.keyboard.press('Escape')
}

async function verifyCreateBoxCostEstimate(page) {
  await page.goto(`${dashboardUrl}/dashboard/boxes`, { waitUntil: 'domcontentloaded' })
  await assertBodyText(page, ['Boxes', 'New Box'])
  await closeOnboardingIfVisible(page)

  await page.getByRole('button', { name: 'New Box' }).click()
  await assertBodyText(page, [
    'Create a box for your agent',
    'PRICE PER HOUR',
    '$0.0677 / hr',
    'CPU 1 vCPU × $0.0504/vCPU·hr',
    'RAM 1 GiB × $0.0162/GiB·hr',
    'Disk 10 GiB × $0.000108/GiB·hr',
  ])
  await page.screenshot({ path: path.join(artifactsDir, 'billing-e2e-create-box-cost.png'), fullPage: true })
}

async function closeOnboardingIfVisible(page) {
  for (const name of ['Maybe later', 'Close']) {
    const button = page.getByRole('button', { name }).last()
    if (await isVisible(button)) {
      await button.click().catch(() => {})
    }
  }
}

async function settleAuthState(page, { allowDashboardOrigin = false } = {}) {
  const dashboardOrigin = new URL(dashboardUrl).origin
  let dashboardSeenAt = 0
  let lastBodyText = ''

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const currentUrl = page.url()
    const bodyText = await page.locator('body').innerText().catch(() => '')
    lastBodyText = bodyText
    if (/Log in to Your Account|Grant Access|BILLING|Boxes/.test(bodyText)) {
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
  throw new Error(
    `Timed out waiting for dashboard or Dex state at ${page.url()}; body=${lastBodyText.slice(0, 240)}`,
  )
}

async function assertBodyText(page, expectedTexts) {
  let missing = expectedTexts
  let lastBodyText = ''
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const bodyText = await page.locator('body').innerText()
    lastBodyText = bodyText
    missing = expectedTexts.filter((text) => !bodyText.includes(text))
    if (missing.length === 0) {
      return
    }
    await delay(250)
  }
  throw new Error(`Missing expected text: ${missing.join(', ')}; body=${lastBodyText.slice(0, 240)}`)
}

async function isVisible(locator) {
  try {
    return await locator.isVisible()
  } catch {
    return false
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
