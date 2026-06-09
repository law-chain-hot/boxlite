/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, OneToOne, Unique, UpdateDateColumn } from 'typeorm'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'
import { SandboxClass } from '../enums/sandbox-class.enum'
import { randomUUID } from 'crypto'
import { SandboxVolume } from '../dto/sandbox.dto'
import { nanoid } from 'nanoid'
import { SandboxLastActivity } from './sandbox-last-activity.entity'
import { BOX_ID_LENGTH, BOX_ID_REGEX, generateBoxId } from '../utils/box-id.util'

@Entity()
@Unique(['organizationId', 'name'])
@Index('sandbox_boxid_unique_idx', ['boxId'], { unique: true })
@Index('sandbox_state_idx', ['state'])
@Index('sandbox_desiredstate_idx', ['desiredState'])
@Index('sandbox_template_idx', ['template'])
@Index('sandbox_runnerid_idx', ['runnerId'])
@Index('sandbox_runner_state_idx', ['runnerId', 'state'])
@Index('sandbox_organizationid_idx', ['organizationId'])
@Index('sandbox_organizationid_boxid_idx', ['organizationId', 'boxId'])
@Index('sandbox_region_idx', ['region'])
@Index('sandbox_resources_idx', ['cpu', 'mem', 'disk', 'gpu'])
@Index('sandbox_runner_state_desired_idx', ['runnerId', 'state', 'desiredState'], {
  where: '"pending" = false',
})
@Index('sandbox_active_only_idx', ['id'], {
  where: `"state" <> ALL (ARRAY['destroyed'::sandbox_state_enum, 'archived'::sandbox_state_enum])`,
})
@Index('sandbox_pending_idx', ['id'], {
  where: `"pending" = true`,
})
@Index('idx_sandbox_authtoken', ['authToken'])
@Index('sandbox_labels_gin_full_idx', { synchronize: false })
@Index('idx_sandbox_volumes_gin', { synchronize: false })
export class Sandbox {
  @PrimaryColumn({ default: () => 'uuid_generate_v4()' })
  id: string

  @Column({ type: 'character varying', length: BOX_ID_LENGTH })
  boxId: string = generateBoxId()

  @Column({
    type: 'uuid',
  })
  organizationId: string

  @Column()
  name: string

  @Column()
  region: string

  @Column({
    type: 'uuid',
    nullable: true,
  })
  runnerId?: string

  //  this is the runnerId of the runner that was previously assigned to the sandbox
  //  if something goes wrong with new runner assignment, we can revert to the previous runner
  @Column({
    type: 'uuid',
    nullable: true,
  })
  prevRunnerId?: string

  @Column({
    type: 'enum',
    enum: SandboxClass,
    default: SandboxClass.SMALL,
  })
  class = SandboxClass.SMALL

  @Column({
    type: 'enum',
    enum: SandboxState,
    default: SandboxState.UNKNOWN,
  })
  state = SandboxState.UNKNOWN

  @Column({
    type: 'enum',
    enum: SandboxDesiredState,
    default: SandboxDesiredState.STARTED,
  })
  desiredState = SandboxDesiredState.STARTED

  @Column({ nullable: true })
  template?: string

  @Column()
  osUser: string

  @Column({ nullable: true })
  errorReason?: string

  @Column({ default: false, type: 'boolean' })
  recoverable = false

  @Column({
    type: 'jsonb',
    default: {},
  })
  env: { [key: string]: string } = {}

  @Column({ default: false, type: 'boolean' })
  public = false

  @Column({ default: false, type: 'boolean' })
  networkBlockAll = false

  @Column({ nullable: true })
  networkAllowList?: string

  @Column('jsonb', { nullable: true })
  labels: { [key: string]: string }

  @Column({ type: 'int', default: 2 })
  cpu = 2

  @Column({ type: 'int', default: 0 })
  gpu = 0

  @Column({ type: 'int', default: 4 })
  mem = 4

  @Column({ type: 'int', default: 10 })
  disk = 10

  @Column({
    type: 'jsonb',
    default: [],
  })
  volumes: SandboxVolume[] = []

  @CreateDateColumn({
    type: 'timestamp with time zone',
  })
  createdAt: Date

  @UpdateDateColumn({
    type: 'timestamp with time zone',
  })
  updatedAt: Date

  @OneToOne(() => SandboxLastActivity, (lastActivity) => lastActivity.sandbox)
  lastActivityAt?: SandboxLastActivity

  //  this is the interval in minutes after which the sandbox will be stopped if lastActivityAt is not updated
  //  if set to 0, auto stop will be disabled
  @Column({ default: 15, type: 'int' })
  autoStopInterval: number | undefined = 15

  //  this is the interval in minutes after which a continuously stopped workspace will be automatically deleted
  //  if set to negative value, auto delete will be disabled
  //  if set to 0, sandbox will be immediately deleted upon stopping
  @Column({ default: -1, type: 'int' })
  autoDeleteInterval: number | undefined = -1

  @Column({ default: false, type: 'boolean' })
  pending: boolean | undefined = false

  @Column({ type: 'character varying' })
  authToken = nanoid(32).toLowerCase()

  @Column({ nullable: true })
  daemonVersion?: string

  constructor(region: string, name?: string) {
    this.id = randomUUID()
    // Set name - use provided name or fallback to ID
    this.name = name || this.id
    this.region = region
  }

  /**
   * Helper method that returns the update data needed for a soft delete operation.
   */
  static getSoftDeleteUpdate(sandbox: Sandbox): Partial<Sandbox> {
    return {
      pending: true,
      desiredState: SandboxDesiredState.DESTROYED,
      name: 'DESTROYED_' + sandbox.name + '_' + Date.now(),
    }
  }

  /**
   * Asserts that the current entity state is valid.
   */
  assertValid(): void {
    this.validateBoxId()
    this.validateDesiredStateTransition()
  }

  private validateBoxId(): void {
    if (!BOX_ID_REGEX.test(this.boxId)) {
      throw new Error(`Sandbox ${this.id} has invalid boxId ${this.boxId}`)
    }
  }

  private validateDesiredStateTransition(): void {
    switch (this.desiredState) {
      case SandboxDesiredState.STARTED:
        if (
          [
            SandboxState.STARTED,
            SandboxState.STOPPED,
            SandboxState.STARTING,
            SandboxState.CREATING,
            SandboxState.UNKNOWN,
            SandboxState.RESTORING,
            SandboxState.PULLING_ARTIFACT,
            SandboxState.ERROR,
            SandboxState.RESIZING,
          ].includes(this.state)
        ) {
          break
        }
        throw new Error(`Sandbox ${this.id} is not in a valid state to be started. State: ${this.state}`)
      case SandboxDesiredState.STOPPED:
        if (
          [
            SandboxState.STARTED,
            SandboxState.STOPPING,
            SandboxState.STOPPED,
            SandboxState.ERROR,
            SandboxState.RESIZING,
          ].includes(this.state)
        ) {
          break
        }
        throw new Error(`Sandbox ${this.id} is not in a valid state to be stopped. State: ${this.state}`)
      case SandboxDesiredState.DESTROYED:
        if (
          [
            SandboxState.DESTROYED,
            SandboxState.DESTROYING,
            SandboxState.STOPPED,
            SandboxState.STARTED,
            SandboxState.ARCHIVED,
            SandboxState.ERROR,
            SandboxState.ARCHIVING,
          ].includes(this.state)
        ) {
          break
        }
        throw new Error(`Sandbox ${this.id} is not in a valid state to be destroyed. State: ${this.state}`)
    }
  }

  /**
   * Enforces domain invariants on the current entity state.
   *
   * @returns Additional field changes that invariant enforcement produced.
   */
  enforceInvariants(): Partial<Sandbox> {
    const changes = this.getInvariantChanges()
    Object.assign(this, changes)
    return changes
  }

  private getInvariantChanges(): Partial<Sandbox> {
    const changes: Partial<Sandbox> = {}

    if (!this.pending && String(this.state) !== String(this.desiredState)) {
      changes.pending = true
    }
    if (this.pending && String(this.state) === String(this.desiredState)) {
      changes.pending = false
    }
    if (this.state === SandboxState.ERROR) {
      changes.pending = false
    }

    if (this.state === SandboxState.DESTROYED || this.state === SandboxState.ARCHIVED) {
      changes.runnerId = null
    }

    return changes
  }
}
