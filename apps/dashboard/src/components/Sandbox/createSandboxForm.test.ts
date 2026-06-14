import { describe, expect, it } from 'vitest'

import { imageNameSchema } from '@/lib/schema'
import {
  CREATE_BOX_ADVANCED_FIELD_GROUPS,
  CREATE_BOX_DEFAULT_ADVANCED_SETTINGS_OPEN,
  CREATE_BOX_IMAGE_OPTIONS,
  DEFAULT_CREATE_BOX_IMAGE,
  CreateBoxFieldGroup,
  SandboxSource,
  buildCreateBoxDefaultValues,
  getCreateBoxSourceOptions,
} from './createSandboxForm'

describe('create box source defaults', () => {
  it('starts MVP users on a valid selectable image when snapshots are hidden', () => {
    const defaults = buildCreateBoxDefaultValues(false)

    expect(defaults.source).toBe(SandboxSource.IMAGE)
    expect(defaults.image).toBe(DEFAULT_CREATE_BOX_IMAGE)
    expect(imageNameSchema.safeParse(defaults.image).success).toBe(true)
  })

  it('keeps snapshot as the default when the snapshot source is enabled', () => {
    const defaults = buildCreateBoxDefaultValues(true)

    expect(defaults.source).toBe(SandboxSource.SNAPSHOT)
    expect(defaults.image).toBe('')
  })

  it('offers only valid pinned image choices', () => {
    expect(CREATE_BOX_IMAGE_OPTIONS.length).toBeGreaterThan(1)

    for (const option of CREATE_BOX_IMAGE_OPTIONS) {
      expect(option.value).not.toContain(':latest')
      expect(imageNameSchema.safeParse(option.value).success).toBe(true)
    }
  })

  it('includes Alpine as a lightweight preset image', () => {
    expect(CREATE_BOX_IMAGE_OPTIONS).toContainEqual({
      label: 'Alpine 3.22',
      value: 'alpine:3.22',
      description: 'Lightweight Linux base image',
    })
  })

  it('removes snapshot from the source switcher when snapshots are hidden', () => {
    expect(getCreateBoxSourceOptions(false)).toEqual([SandboxSource.IMAGE])
    expect(getCreateBoxSourceOptions(true)).toEqual([SandboxSource.SNAPSHOT, SandboxSource.IMAGE])
  })

  it('keeps only expert-only groups behind advanced settings', () => {
    expect(CREATE_BOX_DEFAULT_ADVANCED_SETTINGS_OPEN).toBe(false)
    expect(CREATE_BOX_ADVANCED_FIELD_GROUPS).toEqual([
      CreateBoxFieldGroup.LIFECYCLE,
      CreateBoxFieldGroup.ENVIRONMENT_VARIABLES,
      CreateBoxFieldGroup.LABELS,
      CreateBoxFieldGroup.NETWORK,
    ])
    expect(CREATE_BOX_ADVANCED_FIELD_GROUPS).not.toContain(CreateBoxFieldGroup.NAME)
    expect(CREATE_BOX_ADVANCED_FIELD_GROUPS).not.toContain(CreateBoxFieldGroup.IMAGE)
    expect(CREATE_BOX_ADVANCED_FIELD_GROUPS).not.toContain(CreateBoxFieldGroup.RESOURCES)
  })
})
