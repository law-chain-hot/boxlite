/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

describe('configuration clickhouse defaults', () => {
  const originalEnv = process.env

  async function loadConfiguration(env: NodeJS.ProcessEnv) {
    jest.resetModules()
    process.env = { ...originalEnv }
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    return (await import('./configuration')).configuration
  }

  afterEach(() => {
    process.env = originalEnv
    jest.resetModules()
  })

  it('defaults ClickHouse HTTPS hosts to the ClickHouse Cloud HTTP port', async () => {
    const config = await loadConfiguration({
      CLICKHOUSE_HOST: 'abc123.us-east-1.aws.clickhouse.cloud',
      CLICKHOUSE_PROTOCOL: 'https',
      CLICKHOUSE_PORT: undefined,
    })

    expect(config.clickhouse.protocol).toBe('https')
    expect(config.clickhouse.port).toBe(8443)
  })

  it('keeps self-hosted HTTP ClickHouse on the HTTP interface port', async () => {
    const config = await loadConfiguration({
      CLICKHOUSE_HOST: 'clickhouse.internal',
      CLICKHOUSE_PROTOCOL: 'http',
      CLICKHOUSE_PORT: undefined,
    })

    expect(config.clickhouse.protocol).toBe('http')
    expect(config.clickhouse.port).toBe(8123)
  })

  it('accepts a full ClickHouse URL override for managed deployments', async () => {
    const config = await loadConfiguration({
      CLICKHOUSE_URL: 'https://abc123.us-east-1.aws.clickhouse.cloud:8443',
      CLICKHOUSE_HOST: undefined,
      CLICKHOUSE_PORT: undefined,
    })

    expect(config.clickhouse.url).toBe('https://abc123.us-east-1.aws.clickhouse.cloud:8443')
  })
})
