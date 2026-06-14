/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Drops the `uuid_generate_v4()` default on `box.id`.
 *
 * Box ids are now minted by the application as 12-character Base62 strings
 * (the same format the engine issues for local boxes — see the Box entity and
 * src/boxlite/src/runtime/id.rs). The Box constructor always assigns the id
 * before insert, so the database default was never the source of an id; this
 * removes the stale UUID default so the schema reflects that the application is
 * the sole authority on box id format. The column type is unchanged
 * (`character varying`), so no data rewrite is involved.
 *
 * Safe pre-deploy: an older API still running during a rolling deploy also
 * assigns `id` explicitly (it minted UUIDs), so neither version relied on the
 * column default.
 */
export class Migration1781062769045 implements MigrationInterface {
  name = 'Migration1781062769045'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE IF EXISTS "box" ALTER COLUMN "id" DROP DEFAULT`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE IF EXISTS "box" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`)
  }
}
