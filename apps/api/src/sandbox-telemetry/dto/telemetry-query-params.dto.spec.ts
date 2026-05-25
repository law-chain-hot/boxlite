/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import {
  LogsQueryParamsDto,
  MetricsQueryParamsDto,
  TELEMETRY_FILTER_LIMIT,
  TELEMETRY_FILTER_VALUE_MAX_LENGTH,
  TELEMETRY_METRIC_FILTER_LIMIT,
  TELEMETRY_SEARCH_MAX_LENGTH,
  TelemetryQueryParamsDto,
} from './telemetry-query-params.dto'

describe('telemetry query params DTOs', () => {
  const from = '2026-05-25T00:00:00.000Z'
  const to = '2026-05-25T01:00:00.000Z'

  async function validationErrors<T extends object>(dtoClass: new () => T, value: Record<string, unknown>) {
    return validate(plainToInstance(dtoClass, value))
  }

  it('applies default pagination and enforces the shared page-size cap', async () => {
    const dto = plainToInstance(TelemetryQueryParamsDto, { from, to })

    expect(dto.page).toBe(1)
    expect(dto.limit).toBe(100)
    await expect(validationErrors(TelemetryQueryParamsDto, { from, to, limit: 200 })).resolves.toHaveLength(0)

    const errors = await validationErrors(TelemetryQueryParamsDto, { from, to, limit: 201 })

    expect(errors.some((error) => error.property === 'limit')).toBe(true)
  })

  it('normalizes log severity filters and rejects oversized filters/search terms', async () => {
    const dto = plainToInstance(LogsQueryParamsDto, { from, to, severities: 'ERROR' })

    expect(dto.severities).toEqual(['ERROR'])
    await expect(
      validationErrors(LogsQueryParamsDto, { from, to, severities: Array(TELEMETRY_FILTER_LIMIT).fill('ERROR') }),
    ).resolves.toHaveLength(0)

    const tooManySeverities = await validationErrors(LogsQueryParamsDto, {
      from,
      to,
      severities: Array(TELEMETRY_FILTER_LIMIT + 1).fill('ERROR'),
    })
    const oversizedSeverity = await validationErrors(LogsQueryParamsDto, {
      from,
      to,
      severities: ['x'.repeat(TELEMETRY_FILTER_VALUE_MAX_LENGTH + 1)],
    })
    const oversizedSearch = await validationErrors(LogsQueryParamsDto, {
      from,
      to,
      search: 'x'.repeat(TELEMETRY_SEARCH_MAX_LENGTH + 1),
    })

    expect(tooManySeverities.some((error) => error.property === 'severities')).toBe(true)
    expect(oversizedSeverity.some((error) => error.property === 'severities')).toBe(true)
    expect(oversizedSearch.some((error) => error.property === 'search')).toBe(true)
  })

  it('normalizes metric filters and rejects oversized metric name lists', async () => {
    const dto = plainToInstance(MetricsQueryParamsDto, { from, to, metricNames: 'nodejs.eventloop.delay.mean' })

    expect(dto.metricNames).toEqual(['nodejs.eventloop.delay.mean'])
    await expect(
      validationErrors(MetricsQueryParamsDto, {
        from,
        to,
        metricNames: Array(TELEMETRY_METRIC_FILTER_LIMIT).fill('nodejs.eventloop.delay.mean'),
      }),
    ).resolves.toHaveLength(0)

    const tooManyMetrics = await validationErrors(MetricsQueryParamsDto, {
      from,
      to,
      metricNames: Array(TELEMETRY_METRIC_FILTER_LIMIT + 1).fill('nodejs.eventloop.delay.mean'),
    })
    const oversizedMetricName = await validationErrors(MetricsQueryParamsDto, {
      from,
      to,
      metricNames: ['x'.repeat(TELEMETRY_FILTER_VALUE_MAX_LENGTH + 1)],
    })

    expect(tooManyMetrics.some((error) => error.property === 'metricNames')).toBe(true)
    expect(oversizedMetricName.some((error) => error.property === 'metricNames')).toBe(true)
  })
})
