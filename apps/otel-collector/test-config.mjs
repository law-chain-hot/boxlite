/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { readFile } from 'node:fs/promises'
import YAML from 'yaml'

async function loadConfig(name) {
  return YAML.parse(await readFile(new URL(`./${name}`, import.meta.url), 'utf8'))
}

function assertProcessors(config, name) {
  for (const processor of ['memory_limiter', 'batch']) {
    if (!config.processors?.[processor]) {
      throw new Error(`${name} must define ${processor} processor`)
    }
  }

  for (const signal of ['traces', 'metrics', 'logs']) {
    const processors = config.service?.pipelines?.[signal]?.processors
    if (!Array.isArray(processors)) {
      throw new Error(`${name} missing ${signal} processors`)
    }
    for (const processor of ['memory_limiter', 'batch']) {
      if (!processors.includes(processor)) {
        throw new Error(`${name} ${signal} pipeline must include ${processor}`)
      }
    }
  }
}

const prod = await loadConfig('config.yaml')
const dev = await loadConfig('config.dev.yaml')
const localProdBuilder = await loadConfig('builder-config.local-production.yaml')

assertProcessors(prod, 'config.yaml')
assertProcessors(dev, 'config.dev.yaml')

const clickhouse = prod.exporters?.clickhouse
if (!clickhouse) {
  throw new Error('config.yaml must define ClickHouse exporter')
}
if (clickhouse.endpoint !== '${env:CLICKHOUSE_ENDPOINT}') {
  throw new Error('ClickHouse endpoint must come from CLICKHOUSE_ENDPOINT')
}
if (clickhouse.database !== '${env:CLICKHOUSE_DATABASE:-otel}') {
  throw new Error('ClickHouse database must come from CLICKHOUSE_DATABASE with otel default')
}
if (clickhouse.username !== '${env:CLICKHOUSE_USERNAME:-default}') {
  throw new Error('ClickHouse username must come from CLICKHOUSE_USERNAME with default fallback')
}
if (clickhouse.create_schema !== '${env:CLICKHOUSE_CREATE_SCHEMA:-true}') {
  throw new Error('ClickHouse create_schema must come from CLICKHOUSE_CREATE_SCHEMA with true default')
}
if (clickhouse.compress !== '${env:CLICKHOUSE_COMPRESS:-true}') {
  throw new Error('ClickHouse compress must come from CLICKHOUSE_COMPRESS with true default')
}

const localProdExporter = localProdBuilder.exporters?.find((exporter) => exporter.name === 'boxliteexporter')
if (localProdExporter?.path !== 'otel-collector/exporter') {
  throw new Error('local production builder config must use apps-workspace relative exporter path')
}
if (!localProdBuilder.exporters?.some((exporter) => exporter.name === 'clickhouse')) {
  throw new Error('local production builder config must include ClickHouse exporter')
}
