/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MetricSeries } from '@boxlite-ai/api-client'

export interface PlatformMetricGroup {
  key: string
  title: string
  description: string
  watchFirst: boolean
  convertToGiB: boolean
  series: MetricSeries[]
}

interface PlatformMetricGroupDefinition {
  key: string
  title: string
  description: string
  watchFirst: boolean
  convertToGiB: boolean
  matches: (metricName: string) => boolean
}

const PLATFORM_METRIC_GROUPS: PlatformMetricGroupDefinition[] = [
  {
    key: 'runtime',
    title: 'Runtime saturation',
    description: 'Watch first: event loop delay and utilization show whether the Node.js control plane is saturated.',
    watchFirst: true,
    convertToGiB: false,
    matches: (metricName) => metricName.startsWith('nodejs.eventloop.'),
  },
  {
    key: 'memory',
    title: 'Memory pressure',
    description:
      'Heap usage, limits, and available space show whether V8 memory pressure is building. Values render in GiB.',
    watchFirst: true,
    convertToGiB: true,
    matches: (metricName) => metricName.startsWith('v8js.memory.'),
  },
  {
    key: 'dependencies',
    title: 'Dependency health',
    description: 'Database operation duration and connection pressure show whether dependencies are slowing the API.',
    watchFirst: true,
    convertToGiB: false,
    matches: (metricName) => metricName.startsWith('db.client.'),
  },
  {
    key: 'background',
    title: 'Background jobs',
    description: 'Scheduled manager/service durations show whether lifecycle jobs are slow or stuck.',
    watchFirst: false,
    convertToGiB: false,
    matches: (metricName) => metricName.endsWith('_duration'),
  },
  {
    key: 'other',
    title: 'Other metrics',
    description: 'Raw platform metrics that do not map to a higher-level operational group yet.',
    watchFirst: false,
    convertToGiB: false,
    matches: () => true,
  },
]

const DISPLAY_NAMES: Record<string, string> = {
  'nodejs.eventloop.utilization': 'Event loop utilization',
  'nodejs.eventloop.delay.p99': 'Event loop delay p99',
  'nodejs.eventloop.delay.p90': 'Event loop delay p90',
  'nodejs.eventloop.delay.mean': 'Event loop delay mean',
  'nodejs.eventloop.delay.max': 'Event loop delay max',
  'nodejs.eventloop.time': 'Event loop time',
  'v8js.memory.heap.used': 'Heap used',
  'v8js.memory.heap.limit': 'Heap limit',
  'v8js.memory.heap.space.available_size': 'Heap available space',
  'v8js.memory.heap.space.physical_size': 'Heap physical size',
  'db.client.connection.pending_requests': 'DB pending requests',
  'db.client.connection.count': 'DB connections',
  'db.client.operation.duration': 'DB operation duration',
}

function sentenceCase(words: string[]): string {
  return words
    .filter(Boolean)
    .map((word, index) => {
      if (word.toLowerCase() === 'db') return 'DB'
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()
    })
    .join(' ')
}

export function getMetricDisplayName(metricName: string): string {
  const mapped = DISPLAY_NAMES[metricName]
  if (mapped) return mapped

  if (metricName.startsWith('nodejs.eventloop.delay.')) {
    return sentenceCase(['event', 'loop', 'delay', metricName.split('.').at(-1) ?? ''])
  }

  const withoutDuration = metricName.replace(/_duration$/, '')
  const words = withoutDuration.replace(/\./g, '_').split('_')
  return sentenceCase(words)
}

export function groupPlatformMetricSeries(series: MetricSeries[]): PlatformMetricGroup[] {
  const grouped = new Map<string, MetricSeries[]>()

  for (const metric of series) {
    const group = PLATFORM_METRIC_GROUPS.find((definition) => definition.matches(metric.metricName))
    const key = group?.key ?? 'other'
    const list = grouped.get(key) ?? []
    list.push(metric)
    grouped.set(key, list)
  }

  return PLATFORM_METRIC_GROUPS.flatMap((definition) => {
    const groupSeries = grouped.get(definition.key)
    if (!groupSeries?.length) return []
    return [
      {
        key: definition.key,
        title: definition.title,
        description: definition.description,
        watchFirst: definition.watchFirst,
        convertToGiB: definition.convertToGiB,
        series: groupSeries,
      },
    ]
  })
}
