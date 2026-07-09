import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1782700200000 implements MigrationInterface {
  name = 'Migration1782700200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "wallet" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organizationId" uuid NOT NULL,
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
        "organizationId" uuid NOT NULL,
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
      `CREATE UNIQUE INDEX "wallet_transaction_rated_period_idx" ON "wallet_transaction" ("ratedPeriodId") WHERE "ratedPeriodId" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "wallet_transaction_provider_event_idx" ON "wallet_transaction" ("providerEventId") WHERE "providerEventId" IS NOT NULL`,
    )

    await queryRunner.query(
      `CREATE TABLE "top_up_record" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "walletId" uuid NOT NULL,
        "organizationId" uuid NOT NULL,
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
  }
}
