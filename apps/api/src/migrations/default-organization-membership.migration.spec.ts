/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DefaultOrganizationMembership1780912800000 } from './pre-deploy/1780912800000-migration'
import { DropOrganizationPersonal1780912800001 } from './post-deploy/1780912800001-migration'

function createQueryRunner() {
  return {
    query: jest.fn().mockResolvedValue(undefined),
  }
}

describe('default organization membership migrations', () => {
  it('adds and backfills per-user default membership state before deploy', async () => {
    const queryRunner = createQueryRunner()

    await new DefaultOrganizationMembership1780912800000().up(queryRunner as never)

    const sql = queryRunner.query.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('ADD "isDefaultForUser" boolean NOT NULL DEFAULT false')
    expect(sql).toContain('UPDATE "organization_user" "ou"')
    expect(sql).toContain('"org"."personal" = true')
    expect(sql).toContain('organization_user_default_user_unique')
    expect(sql).toContain('WHERE "isDefaultForUser" = true')
  })

  it('drops the obsolete organization-level personal flag after deploy', async () => {
    const queryRunner = createQueryRunner()

    await new DropOrganizationPersonal1780912800001().up(queryRunner as never)

    expect(queryRunner.query).toHaveBeenCalledWith('ALTER TABLE "organization" DROP COLUMN "personal"')
  })
})
