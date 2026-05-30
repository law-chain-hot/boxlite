/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1780200000000 implements MigrationInterface {
  name = 'Migration1780200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."snapshot_name_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."snapshot_state_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."snapshot_runner_snapshotref_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."snapshot_runner_runnerid_snapshotref_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."snapshot_runner_runnerid_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."snapshot_runner_state_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."sandbox_snapshot_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."warm_pool_find_idx"`)

    await queryRunner.renameColumn('snapshot', 'ref', 'artifactRef')
    await queryRunner.renameColumn('snapshot', 'buildInfoSnapshotRef', 'buildInfoArtifactRef')
    await queryRunner.renameTable('snapshot', 'box_template')
    await queryRunner.renameTable('snapshot_region', 'box_template_region')
    await queryRunner.renameColumn('box_template_region', 'snapshotId', 'templateId')
    await queryRunner.query(`ALTER TYPE "public"."snapshot_state_enum" RENAME TO "box_template_state_enum"`)

    await queryRunner.renameColumn('build_info', 'snapshotRef', 'artifactRef')
    await queryRunner.renameColumn('sandbox', 'buildInfoSnapshotRef', 'buildInfoArtifactRef')
    await queryRunner.renameColumn('sandbox', 'snapshot', 'template')
    await queryRunner.renameColumn('warm_pool', 'snapshot', 'template')
    if (await queryRunner.hasColumn('organization', 'max_snapshot_size')) {
      await queryRunner.renameColumn('organization', 'max_snapshot_size', 'max_template_size')
    }
    if (await queryRunner.hasColumn('organization', 'snapshot_quota')) {
      await queryRunner.renameColumn('organization', 'snapshot_quota', 'template_quota')
    }
    if (await queryRunner.hasColumn('organization', 'snapshot_deactivation_timeout_minutes')) {
      await queryRunner.renameColumn(
        'organization',
        'snapshot_deactivation_timeout_minutes',
        'template_deactivation_timeout_minutes',
      )
    }
    if (await queryRunner.hasColumn('region', 'snapshotManagerUrl')) {
      await queryRunner.renameColumn('region', 'snapshotManagerUrl', 'artifactRegistryUrl')
    }
    if (await queryRunner.hasColumn('runner', 'currentSnapshotCount')) {
      await queryRunner.renameColumn('runner', 'currentSnapshotCount', 'currentArtifactCount')
    }

    await queryRunner.renameTable('snapshot_runner', 'runner_artifact_cache')
    await queryRunner.renameColumn('runner_artifact_cache', 'snapshotRef', 'artifactRef')
    await queryRunner.query(
      `ALTER TYPE "public"."snapshot_runner_state_enum" RENAME TO "runner_artifact_cache_state_enum"`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."runner_artifact_cache_state_enum" RENAME VALUE 'pulling_snapshot' TO 'pulling_artifact'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."runner_artifact_cache_state_enum" RENAME VALUE 'building_snapshot' TO 'building_artifact'`,
    )
    await queryRunner.query(`ALTER TABLE "runner_artifact_cache" ALTER COLUMN "state" SET DEFAULT 'pulling_artifact'`)
    await queryRunner.query(
      `ALTER TYPE "public"."sandbox_state_enum" RENAME VALUE 'pulling_snapshot' TO 'pulling_artifact'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."sandbox_state_enum" RENAME VALUE 'building_snapshot' TO 'building_artifact'`,
    )
    await queryRunner.query(`ALTER TYPE "public"."job_resourcetype_enum" RENAME VALUE 'SNAPSHOT' TO 'ARTIFACT'`)
    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum" RENAME VALUE 'write:snapshots' TO 'write:templates'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum" RENAME VALUE 'delete:snapshots' TO 'delete:templates'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."api_key_permissions_enum" RENAME VALUE 'write:snapshots' TO 'write:templates'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."api_key_permissions_enum" RENAME VALUE 'delete:snapshots' TO 'delete:templates'`,
    )
    await queryRunner.query(`
      UPDATE "organization_role"
      SET "name" = 'Templates Admin', "description" = 'Grants admin access to templates in the organization'
      WHERE "name" = 'Snapshots Admin'
    `)
    await queryRunner.query(`
      UPDATE "job"
      SET "type" = CASE "type"
        WHEN 'BUILD_SNAPSHOT' THEN 'BUILD_ARTIFACT'
        WHEN 'PULL_SNAPSHOT' THEN 'PULL_ARTIFACT'
        WHEN 'REMOVE_SNAPSHOT' THEN 'REMOVE_ARTIFACT'
        WHEN 'INSPECT_SNAPSHOT_IN_REGISTRY' THEN 'INSPECT_ARTIFACT_IN_REGISTRY'
        ELSE "type"
      END
      WHERE "type" IN ('BUILD_SNAPSHOT', 'PULL_SNAPSHOT', 'REMOVE_SNAPSHOT', 'INSPECT_SNAPSHOT_IN_REGISTRY')
    `)

    await queryRunner.query(`CREATE INDEX "runner_artifact_cache_state_idx" ON "runner_artifact_cache" ("state")`)
    await queryRunner.query(`CREATE INDEX "runner_artifact_cache_runnerid_idx" ON "runner_artifact_cache" ("runnerId")`)
    await queryRunner.query(
      `CREATE INDEX "runner_artifact_cache_runnerid_artifactref_idx" ON "runner_artifact_cache" ("runnerId", "artifactRef")`,
    )
    await queryRunner.query(
      `CREATE INDEX "runner_artifact_cache_artifactref_idx" ON "runner_artifact_cache" ("artifactRef")`,
    )
    await queryRunner.query(`CREATE INDEX "box_template_name_idx" ON "box_template" ("name")`)
    await queryRunner.query(`CREATE INDEX "box_template_state_idx" ON "box_template" ("state")`)
    await queryRunner.query(`CREATE INDEX "sandbox_template_idx" ON "sandbox" ("template")`)
    await queryRunner.query(
      `CREATE INDEX "warm_pool_find_idx" ON "warm_pool" ("template", "target", "class", "cpu", "mem", "disk", "gpu", "osUser", "env")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."warm_pool_find_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."sandbox_template_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."box_template_state_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."box_template_name_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."runner_artifact_cache_artifactref_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."runner_artifact_cache_runnerid_artifactref_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."runner_artifact_cache_runnerid_idx"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."runner_artifact_cache_state_idx"`)

    await queryRunner.query(`
      UPDATE "job"
      SET "type" = CASE "type"
        WHEN 'BUILD_ARTIFACT' THEN 'BUILD_SNAPSHOT'
        WHEN 'PULL_ARTIFACT' THEN 'PULL_SNAPSHOT'
        WHEN 'REMOVE_ARTIFACT' THEN 'REMOVE_SNAPSHOT'
        WHEN 'INSPECT_ARTIFACT_IN_REGISTRY' THEN 'INSPECT_SNAPSHOT_IN_REGISTRY'
        ELSE "type"
      END
      WHERE "type" IN ('BUILD_ARTIFACT', 'PULL_ARTIFACT', 'REMOVE_ARTIFACT', 'INSPECT_ARTIFACT_IN_REGISTRY')
    `)
    await queryRunner.query(`ALTER TYPE "public"."job_resourcetype_enum" RENAME VALUE 'ARTIFACT' TO 'SNAPSHOT'`)
    await queryRunner.query(`
      UPDATE "organization_role"
      SET "name" = 'Snapshots Admin', "description" = 'Grants admin access to snapshots in the organization'
      WHERE "name" = 'Templates Admin'
    `)
    await queryRunner.query(
      `ALTER TYPE "public"."api_key_permissions_enum" RENAME VALUE 'delete:templates' TO 'delete:snapshots'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."api_key_permissions_enum" RENAME VALUE 'write:templates' TO 'write:snapshots'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum" RENAME VALUE 'delete:templates' TO 'delete:snapshots'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum" RENAME VALUE 'write:templates' TO 'write:snapshots'`,
    )
    await queryRunner.query(`ALTER TABLE "runner_artifact_cache" ALTER COLUMN "state" SET DEFAULT 'pulling_snapshot'`)
    await queryRunner.query(
      `ALTER TYPE "public"."sandbox_state_enum" RENAME VALUE 'pulling_artifact' TO 'pulling_snapshot'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."sandbox_state_enum" RENAME VALUE 'building_artifact' TO 'building_snapshot'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."runner_artifact_cache_state_enum" RENAME VALUE 'pulling_artifact' TO 'pulling_snapshot'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."runner_artifact_cache_state_enum" RENAME VALUE 'building_artifact' TO 'building_snapshot'`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."runner_artifact_cache_state_enum" RENAME TO "snapshot_runner_state_enum"`,
    )
    await queryRunner.renameColumn('runner_artifact_cache', 'artifactRef', 'snapshotRef')
    await queryRunner.renameTable('runner_artifact_cache', 'snapshot_runner')

    await queryRunner.renameColumn('build_info', 'artifactRef', 'snapshotRef')
    await queryRunner.renameColumn('sandbox', 'buildInfoArtifactRef', 'buildInfoSnapshotRef')
    await queryRunner.renameColumn('sandbox', 'template', 'snapshot')
    await queryRunner.renameColumn('warm_pool', 'template', 'snapshot')
    if (await queryRunner.hasColumn('organization', 'max_template_size')) {
      await queryRunner.renameColumn('organization', 'max_template_size', 'max_snapshot_size')
    }
    if (await queryRunner.hasColumn('organization', 'template_quota')) {
      await queryRunner.renameColumn('organization', 'template_quota', 'snapshot_quota')
    }
    if (await queryRunner.hasColumn('organization', 'template_deactivation_timeout_minutes')) {
      await queryRunner.renameColumn(
        'organization',
        'template_deactivation_timeout_minutes',
        'snapshot_deactivation_timeout_minutes',
      )
    }
    if (await queryRunner.hasColumn('region', 'artifactRegistryUrl')) {
      await queryRunner.renameColumn('region', 'artifactRegistryUrl', 'snapshotManagerUrl')
    }
    if (await queryRunner.hasColumn('runner', 'currentArtifactCount')) {
      await queryRunner.renameColumn('runner', 'currentArtifactCount', 'currentSnapshotCount')
    }

    await queryRunner.query(`ALTER TYPE "public"."box_template_state_enum" RENAME TO "snapshot_state_enum"`)
    await queryRunner.renameColumn('box_template_region', 'templateId', 'snapshotId')
    await queryRunner.renameTable('box_template_region', 'snapshot_region')
    await queryRunner.renameColumn('box_template', 'buildInfoArtifactRef', 'buildInfoSnapshotRef')
    await queryRunner.renameColumn('box_template', 'artifactRef', 'ref')
    await queryRunner.renameTable('box_template', 'snapshot')

    await queryRunner.query(`CREATE INDEX "snapshot_runner_state_idx" ON "snapshot_runner" ("state")`)
    await queryRunner.query(`CREATE INDEX "snapshot_runner_runnerid_idx" ON "snapshot_runner" ("runnerId")`)
    await queryRunner.query(
      `CREATE INDEX "snapshot_runner_runnerid_snapshotref_idx" ON "snapshot_runner" ("runnerId", "snapshotRef")`,
    )
    await queryRunner.query(`CREATE INDEX "snapshot_runner_snapshotref_idx" ON "snapshot_runner" ("snapshotRef")`)
    await queryRunner.query(`CREATE INDEX "snapshot_state_idx" ON "snapshot" ("state")`)
    await queryRunner.query(`CREATE INDEX "snapshot_name_idx" ON "snapshot" ("name")`)
    await queryRunner.query(`CREATE INDEX "sandbox_snapshot_idx" ON "sandbox" ("snapshot")`)
    await queryRunner.query(
      `CREATE INDEX "warm_pool_find_idx" ON "warm_pool" ("snapshot", "target", "class", "cpu", "mem", "disk", "gpu", "osUser", "env")`,
    )
  }
}
