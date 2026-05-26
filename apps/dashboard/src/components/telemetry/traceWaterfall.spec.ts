/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { describe, expect, it } from 'vitest'
import { buildTraceWaterfallRows, resolveSelectedTraceId } from './traceWaterfall'

describe('traceWaterfall', () => {
  it('orders spans by parent-child relationship and calculates timeline geometry', () => {
    const rows = buildTraceWaterfallRows([
      {
        traceId: 'trace-1',
        spanId: 'child',
        parentSpanId: 'root',
        spanName: 'redis.get',
        timestamp: '2026-05-25T00:00:00.005Z',
        durationNs: 2_000_000,
        spanAttributes: {},
      },
      {
        traceId: 'trace-1',
        spanId: 'root',
        spanName: 'GET /api/admin',
        timestamp: '2026-05-25T00:00:00.000Z',
        durationNs: 10_000_000,
        spanAttributes: {},
      },
    ])

    expect(rows.map((row) => row.spanName)).toEqual(['GET /api/admin', 'redis.get'])
    expect(rows.map((row) => row.depth)).toEqual([0, 1])
    expect(rows[0].offsetPercent).toBe(0)
    expect(rows[0].widthPercent).toBe(100)
    expect(rows[1].offsetPercent).toBe(50)
    expect(rows[1].widthPercent).toBe(20)
  })

  it('keeps a valid selected trace and defaults to the first available trace', () => {
    const traces = [{ traceId: 'trace-a' }, { traceId: 'trace-b' }]

    expect(resolveSelectedTraceId(traces, null)).toBe('trace-a')
    expect(resolveSelectedTraceId(traces, 'trace-b')).toBe('trace-b')
    expect(resolveSelectedTraceId(traces, 'missing')).toBe('trace-a')
    expect(resolveSelectedTraceId([], 'trace-a')).toBeNull()
  })
})
