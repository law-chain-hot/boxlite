export enum SandboxSource {
  SNAPSHOT = 'snapshot',
  IMAGE = 'image',
}

export enum CreateBoxFieldGroup {
  NAME = 'name',
  IMAGE = 'image',
  RESOURCES = 'resources',
  LIFECYCLE = 'lifecycle',
  ENVIRONMENT_VARIABLES = 'environmentVariables',
  LABELS = 'labels',
  NETWORK = 'network',
}

export type CreateBoxImageOption = {
  label: string
  value: string
  description: string
}

export type CreateBoxDefaultValues = {
  name: string
  source: SandboxSource
  snapshot?: string
  image?: string
  cpu?: number
  memory?: number
  disk?: number
  autoStopInterval?: number
  autoArchiveInterval?: number
  autoDeleteInterval?: number
  envVars: { key: string; value: string }[]
  labels: { key: string; value: string }[]
  public: boolean
  networkBlockAll: boolean
  ephemeral: boolean
}

export const CREATE_BOX_IMAGE_OPTIONS: CreateBoxImageOption[] = [
  {
    label: 'Ubuntu 22.04 LTS',
    value: 'ubuntu:22.04',
    description: 'Stable default Linux environment',
  },
  {
    label: 'Ubuntu 24.04 LTS',
    value: 'ubuntu:24.04',
    description: 'Newer Ubuntu LTS environment',
  },
  {
    label: 'Node.js 22',
    value: 'node:22-bookworm',
    description: 'Node runtime on Debian Bookworm',
  },
  {
    label: 'Python 3.12',
    value: 'python:3.12-bookworm',
    description: 'Python runtime on Debian Bookworm',
  },
  {
    label: 'Debian 12 Slim',
    value: 'debian:12-slim',
    description: 'Small general-purpose Debian image',
  },
  {
    label: 'Alpine 3.22',
    value: 'alpine:3.22',
    description: 'Lightweight Linux base image',
  },
]

export const DEFAULT_CREATE_BOX_IMAGE = CREATE_BOX_IMAGE_OPTIONS[0].value

export const CREATE_BOX_DEFAULT_ADVANCED_SETTINGS_OPEN = false

export const CREATE_BOX_ADVANCED_FIELD_GROUPS = [
  CreateBoxFieldGroup.LIFECYCLE,
  CreateBoxFieldGroup.ENVIRONMENT_VARIABLES,
  CreateBoxFieldGroup.LABELS,
  CreateBoxFieldGroup.NETWORK,
] as const

export const getCreateBoxSourceOptions = (showSnapshotSource: boolean) =>
  showSnapshotSource ? [SandboxSource.SNAPSHOT, SandboxSource.IMAGE] : [SandboxSource.IMAGE]

export const buildCreateBoxDefaultValues = (showSnapshotSource: boolean): CreateBoxDefaultValues => ({
  name: '',
  source: showSnapshotSource ? SandboxSource.SNAPSHOT : SandboxSource.IMAGE,
  snapshot: undefined,
  image: showSnapshotSource ? '' : DEFAULT_CREATE_BOX_IMAGE,
  cpu: undefined,
  memory: undefined,
  disk: undefined,
  autoStopInterval: undefined,
  autoArchiveInterval: undefined,
  autoDeleteInterval: undefined,
  envVars: [],
  labels: [],
  public: false,
  networkBlockAll: false,
  ephemeral: false,
})
