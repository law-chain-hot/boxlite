/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Box } from '../entities/box.entity'
import { BoxLastActivity } from '../entities/box-last-activity.entity'
import { BoxState } from '../enums/box-state.enum'
import { BoxDesiredState } from '../enums/box-desired-state.enum'
import { BoxRepository } from '../repositories/box.repository'
import { BoxManager } from './box.manager'

const describeDatabase = process.env.BOX_MANAGER_EDGE_DB_TESTS === '1' ? describe : describe.skip

describeDatabase('BoxManager auto-delete query', () => {
  let controlDataSource: DataSource
  let dataSource: DataSource
  let database: string

  beforeAll(async () => {
    database = `box_manager_${randomUUID().replaceAll('-', '')}`
    const connection = {
      type: 'postgres',
      host: process.env.BOX_MANAGER_EDGE_DB_HOST ?? '127.0.0.1',
      port: Number(process.env.BOX_MANAGER_EDGE_DB_PORT ?? 5432),
      username: process.env.BOX_MANAGER_EDGE_DB_USERNAME ?? 'postgres',
      password: process.env.BOX_MANAGER_EDGE_DB_PASSWORD ?? 'postgres',
      database: process.env.BOX_MANAGER_EDGE_DB_DATABASE ?? 'boxlite',
    } as const
    controlDataSource = await new DataSource(connection).initialize()
    await controlDataSource.query(`CREATE DATABASE "${database}"`)
    dataSource = await new DataSource({
      ...connection,
      database,
      entities: [Box, BoxLastActivity],
      synchronize: true,
    }).initialize()
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (controlDataSource?.isInitialized) {
      await controlDataSource.query(`DROP DATABASE IF EXISTS "${database}"`)
      await controlDataSource.destroy()
    }
  })

  it('orders stopped boxes by last activity without crashing TypeORM pagination', async () => {
    const runnerId = randomUUID()
    const box = dataSource.getRepository(Box).create({
      organizationId: randomUUID(),
      name: 'auto-delete-query-test',
      region: 'us',
      runnerId,
      state: BoxState.STOPPED,
      desiredState: BoxDesiredState.STOPPED,
      pending: false,
      autoDeleteInterval: 60,
      osUser: 'root',
    })
    await dataSource.getRepository(Box).save(box)
    await dataSource.getRepository(BoxLastActivity).save({ boxId: box.id, lastActivityAt: new Date() })

    const cache = { invalidate: jest.fn(), invalidateOrgId: jest.fn() }
    const boxes = new BoxRepository(dataSource, new EventEmitter2(), cache as never)
    const runners = { findAllReady: jest.fn().mockResolvedValue([{ id: runnerId }]) }
    const locks = { lock: jest.fn().mockResolvedValue(true), unlock: jest.fn().mockResolvedValue(undefined) }
    const manager = new BoxManager(boxes, runners as never, locks as never, {} as never, {} as never, {} as never)

    await expect(manager.autoDeleteCheck()).resolves.toBeUndefined()
  })
})
