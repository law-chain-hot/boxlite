import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1782700300000 implements MigrationInterface {
  name = 'Migration1782700300000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wallet" ADD "settlementRemainderCents" numeric(30,5) NOT NULL DEFAULT 0`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wallet" DROP COLUMN "settlementRemainderCents"`)
  }
}
