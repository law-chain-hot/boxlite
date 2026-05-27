/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { readFile } from 'node:fs/promises'
import YAML from 'yaml'

const config = YAML.parse(await readFile(new URL('./config.yaml', import.meta.url), 'utf8'))
const pipelines = config.service?.pipelines ?? {}

for (const signal of ['traces', 'metrics', 'logs']) {
  const exporters = pipelines[signal]?.exporters
  if (!Array.isArray(exporters)) {
    throw new Error(`missing ${signal} exporters`)
  }
  if (exporters.includes('otlphttp/jaeger')) {
    throw new Error(`${signal} pipeline must not export to Jaeger in Phase 3`)
  }
  if (exporters.length !== 1 || exporters[0] !== 'clickhouse') {
    throw new Error(`${signal} pipeline must export only to ClickHouse in Phase 3`)
  }
}

if (!config.exporters?.clickhouse) {
  throw new Error('production collector config must define the ClickHouse exporter')
}

const clickhouse = config.exporters.clickhouse
if (clickhouse.endpoint !== '${env:CLICKHOUSE_ENDPOINT}') {
  throw new Error('ClickHouse exporter endpoint must come from CLICKHOUSE_ENDPOINT')
}
if (clickhouse.database !== '${env:CLICKHOUSE_DATABASE:-otel}') {
  throw new Error('ClickHouse exporter database must come from CLICKHOUSE_DATABASE with otel default')
}
if (clickhouse.username !== '${env:CLICKHOUSE_USERNAME:-default}') {
  throw new Error('ClickHouse exporter username must come from CLICKHOUSE_USERNAME with default fallback')
}
