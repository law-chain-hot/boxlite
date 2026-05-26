/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { describe, expect, it } from 'vitest'
import { getMetricDisplayName, groupPlatformMetricSeries } from './platformMetrics'

describe('platformMetrics', () => {
  it('groups platform metrics by operational meaning in watch-first order', () => {
    const groups = groupPlatformMetricSeries([
      { metricName: 'sandbox_manager_autostop_check_duration', dataPoints: [] },
      { metricName: 'v8js.memory.heap.used', dataPoints: [] },
      { metricName: 'db.client.connection.pending_requests', dataPoints: [] },
      { metricName: 'nodejs.eventloop.delay.p99', dataPoints: [] },
      { metricName: 'custom.unclassified.metric', dataPoints: [] },
    ])

    expect(groups.map((group) => group.key)).toEqual(['runtime', 'memory', 'dependencies', 'background', 'other'])
    expect(groups[0]).toMatchObject({
      title: 'Runtime saturation',
      watchFirst: true,
    })
    expect(groups[0].description).toContain('event loop')
  })

  it('formats raw metric names into scannable labels without hiding their source', () => {
    expect(getMetricDisplayName('nodejs.eventloop.delay.p99')).toBe('Event loop delay p99')
    expect(getMetricDisplayName('db.client.connection.pending_requests')).toBe('DB pending requests')
    expect(getMetricDisplayName('sandbox_manager_autostop_check_duration')).toBe('Sandbox manager autostop check')
  })
})
