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
