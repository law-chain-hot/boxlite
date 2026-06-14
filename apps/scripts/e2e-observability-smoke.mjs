#!/usr/bin/env node

import crypto from 'node:crypto'

const layers = [
  { layer: 'api', serviceName: 'boxlite-api', spanId: '1111111111111111', parentSpanId: '', startMs: 0, endMs: 120 },
  {
    layer: 'runner',
    serviceName: 'boxlite-runner',
    spanId: '2222222222222222',
    parentSpanId: '1111111111111111',
    startMs: 20,
    endMs: 100,
  },
  {
    layer: 'ec2_host',
    serviceName: 'boxlite-runner-host',
    spanId: '3333333333333333',
    parentSpanId: '2222222222222222',
    startMs: 35,
    endMs: 80,
  },
  {
    layer: 'box',
    serviceName: 'sandbox-observability-smoke',
    spanId: '4444444444444444',
    parentSpanId: '2222222222222222',
    startMs: 45,
    endMs: 90,
  },
]

const help = process.argv.includes('--help') || process.argv.includes('-h')
if (help) {
  console.log(`Usage:
  BOXLITE_OBS_API_URL=http://localhost:3001/api \\
  BOXLITE_OBS_API_KEY=... \\
  BOXLITE_OBS_OTLP_ENDPOINT=http://localhost:4318 \\
  npm run e2e:observability

Environment:
  BOXLITE_OBS_API_URL        Admin API base URL, defaults to BOXLITE_E2E_API_URL, BOXLITE_API_URL, then http://localhost:3001/api
  BOXLITE_OBS_API_KEY        System Admin API key, defaults to BOXLITE_E2E_API_KEY or BOXLITE_API_KEY
  BOXLITE_OBS_OTLP_ENDPOINT  OTLP HTTP collector endpoint, defaults to OTEL_EXPORTER_OTLP_ENDPOINT then http://localhost:4318
  BOXLITE_OBS_RUN_ID         Optional run id used in synthetic log bodies and attrs
  BOXLITE_OBS_TRACE_ID       Optional 32-char hex trace id
  BOXLITE_OBS_TIMEOUT_MS     Poll timeout, default 60000
  BOXLITE_OBS_POLL_MS        Poll interval, default 3000
`)
  process.exit(0)
}

const apiUrl = stripTrailingSlash(
  process.env.BOXLITE_OBS_API_URL ||
    process.env.BOXLITE_E2E_API_URL ||
    process.env.BOXLITE_API_URL ||
    'http://localhost:3001/api',
)
const apiKey = process.env.BOXLITE_OBS_API_KEY || process.env.BOXLITE_E2E_API_KEY || process.env.BOXLITE_API_KEY
const otlpEndpoint = stripTrailingSlash(
  process.env.BOXLITE_OBS_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
)
const runId = process.env.BOXLITE_OBS_RUN_ID || `obs-smoke-${Date.now()}`
const traceId = process.env.BOXLITE_OBS_TRACE_ID || crypto.randomBytes(16).toString('hex')
const timeoutMs = Number(process.env.BOXLITE_OBS_TIMEOUT_MS || 60000)
const pollMs = Number(process.env.BOXLITE_OBS_POLL_MS || 3000)
const startedAt = new Date()
const from = new Date(startedAt.getTime() - 5 * 60 * 1000).toISOString()
const to = new Date(startedAt.getTime() + 10 * 60 * 1000).toISOString()

assert(apiKey, 'BOXLITE_OBS_API_KEY, BOXLITE_E2E_API_KEY, or BOXLITE_API_KEY is required')
assert(/^[0-9a-f]{32}$/i.test(traceId), 'trace id must be 32 hex characters')

await emitTelemetry()
const result = await waitForObservability()

console.log(
  JSON.stringify(
    {
      ok: true,
      runId,
      traceId,
      apiUrl,
      otlpEndpoint,
      layers: layers.map((item) => item.layer),
      evidence: result,
    },
    null,
    2,
  ),
)

async function emitTelemetry() {
  const now = BigInt(Date.now()) * 1000000n
  const resourceCommon = {
    'boxlite.org_id': 'org-observability-smoke',
    'boxlite.sandbox_id': 'sandbox-observability-smoke',
    'boxlite.box_id': 'box-observability-smoke',
    'boxlite.runner_id': 'runner-observability-smoke',
    'boxlite.machine_id': 'machine-observability-smoke',
    'boxlite.region_id': 'smoke',
    'boxlite.smoke_run_id': runId,
  }

  await postOtlp('/v1/logs', {
    resourceLogs: layers.map((item) => ({
      resource: {
        attributes: attrs({
          'service.name': item.serviceName,
          'boxlite.layer': item.layer,
          ...resourceCommon,
        }),
      },
      scopeLogs: [
        {
          scope: { name: 'boxlite-admin-observability-smoke' },
          logRecords: [
            {
              timeUnixNano: nsPlus(now, item.startMs),
              observedTimeUnixNano: nsPlus(now, item.startMs),
              severityNumber: 9,
              severityText: 'INFO',
              body: { stringValue: `${runId} ${item.layer} observability smoke` },
              traceId,
              spanId: item.spanId,
              attributes: attrs({
                'boxlite.layer': item.layer,
                'boxlite.smoke_run_id': runId,
                signal: 'log',
              }),
            },
          ],
        },
      ],
    })),
  })

  await postOtlp('/v1/traces', {
    resourceSpans: layers.map((item) => ({
      resource: {
        attributes: attrs({
          'service.name': item.serviceName,
          'boxlite.layer': item.layer,
          ...resourceCommon,
        }),
      },
      scopeSpans: [
        {
          scope: { name: 'boxlite-admin-observability-smoke' },
          spans: [
            {
              traceId,
              spanId: item.spanId,
              parentSpanId: item.parentSpanId,
              name: `${runId} ${item.layer} span`,
              kind: 1,
              startTimeUnixNano: nsPlus(now, item.startMs),
              endTimeUnixNano: nsPlus(now, item.endMs),
              attributes: attrs({
                'boxlite.layer': item.layer,
                'boxlite.smoke_run_id': runId,
                ...resourceCommon,
              }),
              status: { code: 1 },
            },
          ],
        },
      ],
    })),
  })

  await postOtlp('/v1/metrics', {
    resourceMetrics: layers.map((item) => ({
      resource: {
        attributes: attrs({
          'service.name': item.serviceName,
          'boxlite.layer': item.layer,
          ...resourceCommon,
        }),
      },
      scopeMetrics: [
        {
          scope: { name: 'boxlite-admin-observability-smoke' },
          metrics: [
            {
              name: 'boxlite.observability.smoke.layer.signal',
              unit: '1',
              gauge: {
                dataPoints: [
                  {
                    timeUnixNano: nsPlus(now, item.endMs),
                    asDouble: 1,
                    attributes: attrs({
                      'boxlite.layer': item.layer,
                      'boxlite.smoke_run_id': runId,
                      signal: 'metric',
                    }),
                  },
                ],
              },
            },
          ],
        },
      ],
    })),
  })
}

async function waitForObservability() {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() <= deadline) {
    try {
      const status = await fetchAdminJson('/admin/observability/status')
      const logs = await fetchAdminJson(
        `/admin/observability/logs?${new URLSearchParams({ from, to, search: runId, limit: '20' })}`,
      )
      const traces = await fetchAdminJson(
        `/admin/observability/traces?${new URLSearchParams({ from, to, limit: '20' })}`,
      )
      const spans = await fetchAdminJson(
        `/admin/observability/traces/${encodeURIComponent(traceId)}?${new URLSearchParams({ from, to })}`,
      )
      const metrics = await fetchAdminJson(
        `/admin/observability/metrics?${new URLSearchParams({
          from,
          to,
          metricNames: 'boxlite.observability.smoke.layer.signal',
          limit: '20',
        })}`,
      )
      const metricsByLayer = await Promise.all(
        layers.map(async ({ layer }) => ({
          layer,
          response: await fetchAdminJson(
            `/admin/observability/metrics?${new URLSearchParams({
              from,
              to,
              layer,
              metricNames: 'boxlite.observability.smoke.layer.signal',
              limit: '20',
            })}`,
          ),
        })),
      )

      assertReceiving(status)
      assertLayerSet(logs.items?.map((item) => item.resourceAttributes?.['boxlite.layer']), 'logs')
      assert(Number(logs.total) >= 4, `expected at least 4 logs, got ${logs.total}`)
      assert(traces.items?.some((item) => item.traceId === traceId), `trace ${traceId} is missing from trace list`)
      assertLayerSet(spans.map((item) => item.spanAttributes?.['boxlite.layer']), 'trace spans')
      assert(metrics.series?.some((item) => item.metricName === 'boxlite.observability.smoke.layer.signal'), 'metric series is missing')
      assertLayerSet(metrics.series?.map((item) => item.layer), 'metric series')
      for (const { layer, response } of metricsByLayer) {
        assert(
          response.series?.some((item) => item.metricName === 'boxlite.observability.smoke.layer.signal'),
          `metric series is missing for layer ${layer}`,
        )
      }

      return {
        backend: status.backend?.state,
        logTotal: String(logs.total),
        traceId,
        spanCount: spans.length,
        metricSeries: metrics.series.length,
        metricLayers: metricsByLayer.map(({ layer }) => layer),
      }
    } catch (error) {
      lastError = error
      await delay(pollMs)
    }
  }

  throw new Error(`observability smoke timed out after ${timeoutMs}ms: ${lastError?.message || 'no result'}`)
}

function assertReceiving(status) {
  assert(status.backend?.state === 'receiving', `backend is ${status.backend?.state || 'missing'}, expected receiving`)
  const byLayer = new Map((status.layers || []).map((item) => [item.layer, item]))

  for (const { layer } of layers) {
    const item = byLayer.get(layer)
    assert(item, `status missing layer ${layer}`)
    for (const signal of ['logs', 'traces', 'metrics']) {
      assert(item.signals?.[signal] === 'receiving', `${layer}.${signal} is ${item.signals?.[signal] || 'missing'}`)
    }
  }
}

function assertLayerSet(values, label) {
  const set = new Set((values || []).filter(Boolean))
  for (const { layer } of layers) {
    assert(set.has(layer), `${label} missing layer ${layer}`)
  }
}

async function postOtlp(path, body) {
  const res = await fetch(`${otlpEndpoint}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`OTLP ${path} failed with ${res.status}: ${await res.text()}`)
  }
}

async function fetchAdminJson(path) {
  const res = await fetch(`${apiUrl}${path}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      'x-boxlite-source': 'cli',
      'x-boxlite-api-version': '2',
    },
  })
  if (!res.ok) {
    throw new Error(`Admin API ${path} failed with ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

function attrs(value) {
  return Object.entries(value).map(([key, attrValue]) => ({
    key,
    value: { stringValue: String(attrValue) },
  }))
}

function nsPlus(now, ms) {
  return String(now + BigInt(ms) * 1000000n)
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function assert(value, message) {
  if (!value) {
    throw new Error(message)
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
