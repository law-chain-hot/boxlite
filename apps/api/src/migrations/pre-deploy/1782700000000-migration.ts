import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1782700000000 implements MigrationInterface {
  name = 'Migration1782700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "usage_period" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "boxId" character varying NOT NULL,
        "organizationId" character varying NOT NULL,
        "region" character varying,
        "startAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endAt" TIMESTAMP WITH TIME ZONE,
        "kind" character varying NOT NULL,
        "cpu" double precision NOT NULL,
        "gpu" double precision NOT NULL,
        "mem" double precision NOT NULL,
        "disk" double precision NOT NULL,
        "actualCpuSeconds" double precision,
        "actualRssAvgBytes" bigint,
        "actualRssPeakBytes" bigint,
        "sampleCount" integer,
        CONSTRAINT "usage_period_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "usage_period_end_after_start" CHECK ("endAt" IS NULL OR "endAt" >= "startAt")
      )`,
    )
    await queryRunner.query(`CREATE INDEX "usage_period_box_end_idx" ON "usage_period" ("boxId", "endAt")`)
    await queryRunner.query(`CREATE INDEX "usage_period_org_start_idx" ON "usage_period" ("organizationId", "startAt")`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "usage_period_one_open_per_box_idx" ON "usage_period" ("boxId") WHERE "endAt" IS NULL`,
    )

    await queryRunner.query(
      `CREATE TABLE "usage_period_archive" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sourcePeriodId" uuid NOT NULL,
        "boxId" character varying NOT NULL,
        "organizationId" character varying NOT NULL,
        "region" character varying,
        "startAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "kind" character varying NOT NULL,
        "cpu" double precision NOT NULL,
        "gpu" double precision NOT NULL,
        "mem" double precision NOT NULL,
        "disk" double precision NOT NULL,
        "actualCpuSeconds" double precision,
        "actualRssAvgBytes" bigint,
        "actualRssPeakBytes" bigint,
        "sampleCount" integer,
        CONSTRAINT "usage_period_archive_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "usage_period_archive_end_after_start" CHECK ("endAt" >= "startAt")
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "usage_period_archive_source_period_idx" ON "usage_period_archive" ("sourcePeriodId")`,
    )
    await queryRunner.query(
      `CREATE INDEX "usage_period_archive_org_start_idx" ON "usage_period_archive" ("organizationId", "startAt")`,
    )
    await queryRunner.query(
      `CREATE INDEX "usage_period_archive_box_start_idx" ON "usage_period_archive" ("boxId", "startAt")`,
    )

    await queryRunner.query(
      `CREATE TABLE "pricing_plan" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "version" integer NOT NULL,
        "cpuRateCentsPerSec" numeric(30,10) NOT NULL,
        "memRateCentsPerSec" numeric(30,10) NOT NULL,
        "diskRateCentsPerSec" numeric(30,10) NOT NULL,
        "gpuRateCentsPerSec" numeric(30,10) NOT NULL,
        "warnThresholdCents" bigint NOT NULL,
        "defaultGrantCents" bigint NOT NULL,
        "effectiveFrom" TIMESTAMP WITH TIME ZONE NOT NULL,
        "effectiveTo" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pricing_plan_id_pk" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(`CREATE UNIQUE INDEX "pricing_plan_version_idx" ON "pricing_plan" ("version")`)
    await queryRunner.query(`CREATE INDEX "pricing_plan_effective_idx" ON "pricing_plan" ("effectiveFrom")`)
    await queryRunner.query(
      `INSERT INTO "pricing_plan" (
        "version",
        "cpuRateCentsPerSec",
        "memRateCentsPerSec",
        "diskRateCentsPerSec",
        "gpuRateCentsPerSec",
        "warnThresholdCents",
        "defaultGrantCents",
        "effectiveFrom",
        "effectiveTo"
      ) VALUES (
        1,
        0.0014,
        0.00045,
        0.000003,
        0,
        1000,
        10000,
        '2026-01-01T00:00:00Z',
        NULL
      )`,
    )

    await queryRunner.query(
      `CREATE TABLE "rated_period" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "usagePeriodArchiveId" uuid NOT NULL,
        "sourcePeriodId" uuid NOT NULL,
        "organizationId" character varying NOT NULL,
        "boxId" character varying NOT NULL,
        "pricingVersion" integer NOT NULL,
        "unitRates" jsonb NOT NULL,
        "usageTotals" jsonb NOT NULL,
        "billedSeconds" numeric(30,5) NOT NULL,
        "preciseCents" numeric(30,5) NOT NULL,
        "ratedCents" bigint NOT NULL,
        "ratedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "rated_period_id_pk" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(`CREATE UNIQUE INDEX "rated_period_usage_archive_idx" ON "rated_period" ("usagePeriodArchiveId")`)
    await queryRunner.query(
      `CREATE INDEX "rated_period_org_rated_at_idx" ON "rated_period" ("organizationId", "ratedAt")`,
    )

    await queryRunner.query(
      `CREATE TABLE "wallet" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organizationId" character varying NOT NULL,
        "freeBalanceCents" bigint NOT NULL DEFAULT 0,
        "paidBalanceCents" bigint NOT NULL DEFAULT 0,
        "freeExpiresAt" TIMESTAMP WITH TIME ZONE,
        "billingStatus" character varying NOT NULL DEFAULT 'trial',
        "creditCardConnected" boolean NOT NULL DEFAULT false,
        "automaticTopUpThresholdCents" bigint,
        "automaticTopUpTargetCents" bigint,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "wallet_id_pk" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(`CREATE UNIQUE INDEX "wallet_organization_idx" ON "wallet" ("organizationId")`)

    await queryRunner.query(
      `CREATE TABLE "wallet_transaction" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "walletId" uuid NOT NULL,
        "organizationId" character varying NOT NULL,
        "kind" character varying NOT NULL,
        "amountCents" bigint NOT NULL,
        "source" character varying NOT NULL,
        "ratedPeriodId" uuid,
        "providerEventId" character varying,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "wallet_transaction_id_pk" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(
      `CREATE INDEX "wallet_transaction_wallet_created_idx" ON "wallet_transaction" ("walletId", "createdAt")`,
    )
    await queryRunner.query(
      `CREATE INDEX "wallet_transaction_org_created_idx" ON "wallet_transaction" ("organizationId", "createdAt")`,
    )

    await queryRunner.query(
      `CREATE TABLE "top_up_record" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "walletId" uuid NOT NULL,
        "organizationId" character varying NOT NULL,
        "amountCents" bigint NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "checkoutUrl" character varying,
        "providerReference" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "top_up_record_id_pk" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(
      `CREATE INDEX "top_up_record_org_created_idx" ON "top_up_record" ("organizationId", "createdAt")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "top_up_record"`)
    await queryRunner.query(`DROP TABLE "wallet_transaction"`)
    await queryRunner.query(`DROP TABLE "wallet"`)
    await queryRunner.query(`DROP TABLE "rated_period"`)
    await queryRunner.query(`DROP TABLE "pricing_plan"`)
    await queryRunner.query(`DROP TABLE "usage_period_archive"`)
    await queryRunner.query(`DROP TABLE "usage_period"`)
  }
}
