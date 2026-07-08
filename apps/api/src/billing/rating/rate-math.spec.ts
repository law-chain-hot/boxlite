/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { computeRatedCents, periodBillableTotals, RateSnapshot } from './rate-math'

const snapshot = (overrides: Partial<RateSnapshot> = {}): RateSnapshot => ({
  cpuRateCentsPerSec: '2',
  memRateCentsPerSec: '1',
  diskRateCentsPerSec: '0.5',
  gpuRateCentsPerSec: '10',
  discountFactor: '1',
  ...overrides,
})

describe('periodBillableTotals', () => {
  const startAt = new Date('2026-07-08T00:00:00Z')
  const endAt = new Date('2026-07-08T00:01:00Z')

  it('uses all dimensions for running usage periods', () => {
    expect(
      periodBillableTotals({
        startAt,
        endAt,
        kind: 'running',
        cpu: 2,
        mem: 4,
        disk: 10,
        gpu: 1,
      }),
    ).toEqual({
      billedSeconds: 60,
      totals: {
        cpuSeconds: 120,
        memGibSeconds: 240,
        diskGibSeconds: 600,
        gpuSeconds: 60,
      },
    })
  })

  it('uses only disk for stopped usage periods', () => {
    expect(
      periodBillableTotals({
        startAt,
        endAt,
        kind: 'stopped',
        cpu: 0,
        mem: 0,
        disk: 10,
        gpu: 0,
      }),
    ).toEqual({
      billedSeconds: 60,
      totals: {
        cpuSeconds: 0,
        memGibSeconds: 0,
        diskGibSeconds: 600,
        gpuSeconds: 0,
      },
    })
  })
})

describe('computeRatedCents', () => {
  it('rates CPU, memory, disk, and GPU totals with an immutable rate snapshot', () => {
    const result = computeRatedCents(
      {
        cpuSeconds: 120,
        memGibSeconds: 240,
        diskGibSeconds: 600,
        gpuSeconds: 60,
      },
      snapshot(),
    )

    expect(result).toEqual({
      preciseCents: '1380',
      ratedCents: 1380,
    })
  })

  it('applies discount factor before rounding to cents', () => {
    expect(
      computeRatedCents(
        {
          cpuSeconds: 1,
          memGibSeconds: 0,
          diskGibSeconds: 0,
          gpuSeconds: 0,
        },
        snapshot({ cpuRateCentsPerSec: '20.5', discountFactor: '0.5' }),
      ),
    ).toEqual({
      preciseCents: '10.25',
      ratedCents: 10,
    })
  })

  it('uses half-up rounding at the cent boundary', () => {
    expect(
      computeRatedCents(
        {
          cpuSeconds: 1,
          memGibSeconds: 0,
          diskGibSeconds: 0,
          gpuSeconds: 0,
        },
        snapshot({ cpuRateCentsPerSec: '20.5' }),
      ).ratedCents,
    ).toBe(21)
  })
})
