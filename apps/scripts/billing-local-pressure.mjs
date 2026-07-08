#!/usr/bin/env node

import crypto from 'node:crypto'
import process from 'node:process'
import pg from 'pg'
import Redis from 'ioredis'

const { Pool } = pg

const apiUrl = stripTrailingSlash(process.env.BOXLITE_E2E_API_URL || 'http://localhost:3001/api')
const loginEmail = process.env.BOXLITE_E2E_LOGIN_EMAIL || 'admin@boxlite.dev'
const durationMs = readPositiveInt('BILLING_PRESSURE_DURATION_MS', 30_000)
const concurrency = readPositiveInt('BILLING_PRESSURE_CONCURRENCY', 20)
const timeoutMs = readPositiveInt('BILLING_PRESSURE_TIMEOUT_MS', 10_000)
const maxErrorRate = Number(process.env.BILLING_PRESSURE_MAX_ERROR_RATE || '0')
const maxP95Ms = readPositiveInt('BILLING_PRESSURE_MAX_P95_MS', 2_000)
const apiKeyValue =
  process.env.BILLING_PRESSURE_API_KEY ||
  `blk_test_billingpressure${Date.now().toString(36)}${crypto.randomBytes(12).toString('hex')}`
const apiKeyName = process.env.BILLING_PRESSURE_API_KEY_NAME || 'billing-pressure-local'

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 25432),
  user: process.env.DB_USERNAME || 'boxlite',
  password: process.env.DB_PASSWORD || 'boxlite',
  database: process.env.DB_DATABASE || 'boxlite',
  max: 4,
})

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 26379),
  lazyConnect: true,
  maxRetriesPerRequest: 1,
})

const stats = {
  requests: 0,
  failures: [],
  durations: [],
  statusCounts: new Map(),
}

let organizationId
let userId

try {
  ;({ organizationId, userId } = await ensurePressureApiKey())
  await warmUp()
  await runPressure()
  report()
} finally {
  await cleanupPressureApiKey().catch((error) => {
    console.warn(`cleanup warning: ${error.message}`)
  })
  await redis.quit().catch(() => {})
  await pool.end().catch(() => {})
}

async function ensurePressureApiKey() {
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
  const keyHash = hashApiKey(apiKeyValue)
  await pool.query('delete from api_key where "organizationId" = $1 and "userId" = $2 and name = $3', [
    row.organizationId,
    row.userId,
    apiKeyName,
  ])
  await pool.query(
    `
      insert into api_key (
        "organizationId",
        "userId",
        name,
        "keyHash",
        "keyPrefix",
        "keySuffix",
        permissions,
        "createdAt"
      )
      values ($1, $2, $3, $4, $5, $6, ARRAY[]::api_key_permissions_enum[], now())
    `,
    [row.organizationId, row.userId, apiKeyName, keyHash, displayPrefix(apiKeyValue), apiKeyValue.slice(-3)],
  )
  await redis.connect().catch(() => {})
  await redis.del(`api-key:validation:${keyHash}`).catch(() => {})
  await redis.del(`api-key:user:${row.userId}`).catch(() => {})

  return row
}

async function warmUp() {
  for (const endpoint of endpoints()) {
    const response = await request(endpoint)
    if (response.error) {
      throw new Error(`warm-up failed for ${endpoint.label}: ${response.error}`)
    }
  }
}

async function runPressure() {
  const deadline = Date.now() + durationMs
  let nextEndpoint = 0

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < deadline) {
        const availableEndpoints = endpoints()
        const endpoint = availableEndpoints[nextEndpoint % availableEndpoints.length]
        nextEndpoint += 1
        const result = await request(endpoint)
        record(result)
      }
    }),
  )
}

async function request(endpoint) {
  const started = process.hrtime.bigint()
  try {
    const response = await fetchWithTimeout(`${apiUrl}${endpoint.path}`, {
      method: endpoint.method || 'GET',
      headers: {
        Authorization: `Bearer ${apiKeyValue}`,
        Accept: 'application/json',
      },
    })
    const body = await response.text()
    const duration = elapsedMs(started)
    if (!response.ok) {
      return {
        endpoint: endpoint.label,
        status: response.status,
        duration,
        error: `HTTP ${response.status}: ${body.slice(0, 240)}`,
      }
    }
    if (body) {
      JSON.parse(body)
    }
    return { endpoint: endpoint.label, status: response.status, duration }
  } catch (error) {
    return {
      endpoint: endpoint.label,
      status: 'ERR',
      duration: elapsedMs(started),
      error: error.message,
    }
  }
}

function endpoints() {
  const encodedOrgId = encodeURIComponent(organizationId)
  return [
    { label: 'wallet', path: `/organization/${encodedOrgId}/wallet` },
    { label: 'current-usage', path: `/organization/${encodedOrgId}/usage` },
    { label: 'past-usage', path: `/organization/${encodedOrgId}/usage/past?periods=12` },
    { label: 'org-tier', path: `/organization/${encodedOrgId}/tier` },
    { label: 'tiers', path: '/tier' },
    { label: 'invoices', path: `/organization/${encodedOrgId}/invoices?page=1&perPage=20` },
  ]
}

function record(result) {
  stats.requests += 1
  stats.durations.push(result.duration)
  stats.statusCounts.set(result.status, (stats.statusCounts.get(result.status) || 0) + 1)
  if (result.error) {
    stats.failures.push(result)
  }
}

function report() {
  const p50 = percentile(stats.durations, 50)
  const p95 = percentile(stats.durations, 95)
  const p99 = percentile(stats.durations, 99)
  const errorRate = stats.requests === 0 ? 1 : stats.failures.length / stats.requests
  const statusCounts = Object.fromEntries([...stats.statusCounts.entries()].sort())

  console.log(
    JSON.stringify(
      {
        ok: stats.failures.length === 0 && errorRate <= maxErrorRate && p95 <= maxP95Ms,
        apiUrl,
        organizationId,
        durationMs,
        concurrency,
        requests: stats.requests,
        failures: stats.failures.length,
        errorRate,
        p50Ms: p50,
        p95Ms: p95,
        p99Ms: p99,
        statusCounts,
        sampleFailures: stats.failures.slice(0, 5),
      },
      null,
      2,
    ),
  )

  if (stats.requests === 0) {
    throw new Error('pressure run issued zero requests')
  }
  if (errorRate > maxErrorRate) {
    throw new Error(`pressure error rate ${errorRate} exceeded ${maxErrorRate}`)
  }
  if (p95 > maxP95Ms) {
    throw new Error(`pressure p95 ${p95}ms exceeded ${maxP95Ms}ms`)
  }
}

async function cleanupPressureApiKey() {
  if (!organizationId || !userId) {
    return
  }
  const keyHash = hashApiKey(apiKeyValue)
  await pool.query('delete from api_key where "organizationId" = $1 and "userId" = $2 and name = $3', [
    organizationId,
    userId,
    apiKeyName,
  ])
  await redis.del(`api-key:validation:${keyHash}`).catch(() => {})
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
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

function elapsedMs(started) {
  return Number(process.hrtime.bigint() - started) / 1_000_000
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  return Math.round(sorted[index] * 100) / 100
}

function readPositiveInt(name, fallback) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}
