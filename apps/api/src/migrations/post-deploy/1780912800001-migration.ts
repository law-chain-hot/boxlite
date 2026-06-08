/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropOrganizationPersonal1780912800001 implements MigrationInterface {
  name = 'DropOrganizationPersonal1780912800001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "organization" DROP COLUMN "personal"')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "organization" ADD "personal" boolean NOT NULL DEFAULT false')
    await queryRunner.query(`
      UPDATE "organization" "org"
      SET "personal" = true
      FROM "organization_user" "ou"
      WHERE "ou"."organizationId" = "org"."id"
        AND "ou"."userId" = "org"."createdBy"
        AND "ou"."isDefaultForUser" = true
    `)
  }
}
