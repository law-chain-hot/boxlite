/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResourceChip } from '@/components/ResourceChip'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { RoutePath } from '@/enums/RoutePath'
import { useCreateSandboxFromEnvironmentMutation } from '@/hooks/mutations/useCreateSandboxFromEnvironmentMutation'
import { useEnvironmentsQuery } from '@/hooks/queries/useEnvironmentsQuery'
import type { Environment } from '@/hooks/queries/useEnvironmentsQuery'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { getEnvironmentDisplayMetadata, getEnvironmentDisplaySortIndex } from '@/lib/environment-display'
import { handleApiError } from '@/lib/error-handling'
import { cn } from '@/lib/utils'
import type { Sandbox } from '@boxlite-ai/api-client'
import { useForm } from '@tanstack/react-form'
import { CheckCircle2, Cpu, HardDrive, Layers, MemoryStick, Plus, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NumericFormat } from 'react-number-format'
import { createSearchParams, generatePath, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { ScrollArea } from '../ui/scroll-area'

const NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const MAX_INTERVAL_MINUTES = 2_147_483_647

const isOptionalIntegerInRange = (value: string | undefined, min: number) => {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return true
  if (!/^-?\d+$/.test(trimmedValue)) return false

  const numericValue = Number(trimmedValue)
  return Number.isSafeInteger(numericValue) && numericValue >= min && numericValue <= MAX_INTERVAL_MINUTES
}

const isOptionalPositiveInteger = (value: string | undefined) => {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return true
  if (!/^\d+$/.test(trimmedValue)) return false

  const numericValue = Number(trimmedValue)
  return Number.isSafeInteger(numericValue) && numericValue >= 1
}

const parseOptionalInteger = (value: string | undefined) => {
  const trimmedValue = value?.trim()
  return trimmedValue ? Number(trimmedValue) : undefined
}

const formSchema = z.object({
  name: z
    .string()
    .optional()
    .refine((val) => !val || NAME_REGEX.test(val), 'Only letters, digits, dots, underscores and dashes are allowed'),
  environment: z.string().min(1, 'Select a base image'),
  autoStopInterval: z
    .string()
    .optional()
    .refine((val) => isOptionalIntegerInRange(val, 0), 'Enter a whole number of minutes, 0 or greater'),
  autoDeleteInterval: z
    .string()
    .optional()
    .refine((val) => isOptionalIntegerInRange(val, -1), 'Enter a whole number of minutes, -1 or greater'),
  cpu: z.string().optional().refine(isOptionalPositiveInteger, 'Enter a whole number, 1 or greater'),
  memory: z.string().optional().refine(isOptionalPositiveInteger, 'Enter a whole number, 1 or greater'),
  disk: z.string().optional().refine(isOptionalPositiveInteger, 'Enter a whole number, 1 or greater'),
})

type FormValues = z.input<typeof formSchema>

const defaultValues: FormValues = {
  name: '',
  environment: '',
  autoStopInterval: '',
  autoDeleteInterval: '',
  cpu: '',
  memory: '',
  disk: '',
}

const getEnvironmentImageTag = (environment: Environment) => environment.imageName || environment.name

const getEnvironmentLabel = (environment: Environment) => {
  const imageTag = getEnvironmentImageTag(environment)
  return environment.displayName || getEnvironmentDisplayMetadata(imageTag)?.displayName || imageTag
}

const getEnvironmentDescription = (environment: Environment) => {
  const imageTag = getEnvironmentImageTag(environment)
  return environment.description || getEnvironmentDisplayMetadata(imageTag)?.description
}

const getEnvironmentResourceSummary = (environment: Environment) => ({
  cpu: environment.cpu ?? 1,
  memory: environment.mem ?? 1,
  disk: environment.disk ?? 3,
})

type ResourceFieldName = 'cpu' | 'memory' | 'disk'

const RESOURCE_FIELDS: Array<{
  name: ResourceFieldName
  label: string
  unit: string
  Icon: LucideIcon
}> = [
  { name: 'cpu', label: 'CPU', unit: 'vCPU', Icon: Cpu },
  { name: 'memory', label: 'Memory', unit: 'GiB', Icon: MemoryStick },
  { name: 'disk', label: 'Disk', unit: 'GiB', Icon: HardDrive },
]

export const CreateSandboxSheet = ({
  className,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: {
  className?: string
  triggerClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCreated?: (sandbox: Sandbox) => void
}) => {
  const navigate = useNavigate()
  const [internalOpen, setInternalOpen] = useState(false)
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false)
  const [focusedAdvancedField, setFocusedAdvancedField] = useState<string | null>(null)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const { defaultSnapshot } = useConfig()
  const { selectedOrganization } = useSelectedOrganization()
  const { reset: resetCreateSandboxMutation, ...createSandboxMutation } = useCreateSandboxFromEnvironmentMutation()
  const formRef = useRef<HTMLFormElement>(null)

  const { data: environmentsData, isLoading: environmentsLoading } = useEnvironmentsQuery()

  const environments = useMemo(() => {
    const items = environmentsData ?? []
    return [...items].sort((a, b) => {
      if (a.name === defaultSnapshot || a.id === defaultSnapshot) return -1
      if (b.name === defaultSnapshot || b.id === defaultSnapshot) return 1
      const order =
        getEnvironmentDisplaySortIndex(getEnvironmentImageTag(a)) -
        getEnvironmentDisplaySortIndex(getEnvironmentImageTag(b))
      if (order !== 0) return order

      return getEnvironmentLabel(a).localeCompare(getEnvironmentLabel(b))
    })
  }, [defaultSnapshot, environmentsData])

  const defaultEnvironmentId = environments[0]?.id ?? ''

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmitInvalid: () => {
      const formEl = formRef.current
      if (!formEl) return
      const invalidInput = formEl.querySelector('[aria-invalid="true"]') as HTMLInputElement | null
      if (invalidInput) {
        invalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        invalidInput.focus()
      }
    },
    onSubmit: async ({ value }) => {
      if (!selectedOrganization?.id) {
        toast.error('Select an organization to create a box.')
        return
      }

      if (!value.environment) {
        toast.error('Select a base image to create a box.')
        return
      }

      let sandboxId: string | undefined = undefined
      try {
        const sandbox = await createSandboxMutation.mutateAsync({
          name: value.name?.trim() || undefined,
          environmentId: value.environment,
          public: false,
          networkBlockAll: false,
          autoStopInterval: parseOptionalInteger(value.autoStopInterval),
          autoDeleteInterval: parseOptionalInteger(value.autoDeleteInterval),
          cpu: parseOptionalInteger(value.cpu),
          memory: parseOptionalInteger(value.memory),
          disk: parseOptionalInteger(value.disk),
        })
        sandboxId = sandbox.id
        onCreated?.(sandbox)

        toast.success('Box created')
        setOpen(false)

        if (sandboxId) {
          navigate({
            pathname: generatePath(RoutePath.BOX_DETAILS, { sandboxId }),
            search: `${createSearchParams({
              tab: 'terminal',
            })}`,
          })
        }
      } catch (error) {
        handleApiError(error, 'Failed to create box')
      }
    },
  })

  const resetState = useCallback(() => {
    form.reset(defaultValues)
    setAdvancedOptionsOpen(false)
    setFocusedAdvancedField(null)
    resetCreateSandboxMutation()
  }, [resetCreateSandboxMutation, form])

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  useEffect(() => {
    if (!open || !defaultEnvironmentId || form.getFieldValue('environment')) {
      return
    }
    form.setFieldValue('environment', defaultEnvironmentId)
  }, [defaultEnvironmentId, form, open])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="default" size="sm" title="Create Box" className={cn('w-full sm:w-auto', triggerClassName)}>
          <Plus className="size-4" />
          <span>Create Box</span>
        </Button>
      </SheetTrigger>
      <SheetContent className={`w-dvw sm:w-[600px] p-0 flex flex-col gap-0 ${className ?? ''}`}>
        <SheetHeader className="border-b border-border p-5 px-6 items-center flex text-left flex-row">
          <SheetTitle className="text-2xl leading-tight">Create Box</SheetTitle>
          <SheetDescription className="sr-only">Create a new box in your organization.</SheetDescription>
        </SheetHeader>
        <ScrollArea fade="mask" className="flex-1 min-h-0">
          <form
            ref={formRef}
            id="create-sandbox-form"
            className="gap-5 flex flex-col p-5 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
          >
            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name} className="text-sm font-semibold">
                      Name
                    </FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="my-box"
                    />
                    {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="environment">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name} className="text-sm font-semibold">
                      Base image
                    </FieldLabel>
                    <FieldDescription>Choose a shared Linux base image for this box.</FieldDescription>
                    <div
                      id={field.name}
                      role="radiogroup"
                      aria-invalid={isInvalid}
                      aria-label="Base image"
                      className="grid gap-3"
                    >
                      {environmentsLoading && (
                        <div className="rounded-md border bg-muted/35 p-4 text-sm text-muted-foreground">
                          Loading base images...
                        </div>
                      )}
                      {!environmentsLoading && environments.length === 0 && (
                        <div className="rounded-md border bg-muted/35 p-4 text-sm text-muted-foreground">
                          No base images are available for this organization.
                        </div>
                      )}
                      {environments.map((environment) => {
                        const imageTag = getEnvironmentImageTag(environment)
                        const description = getEnvironmentDescription(environment) ?? 'Linux base environment'
                        const resources = getEnvironmentResourceSummary(environment)
                        const selected = field.state.value === environment.id
                        const isDefault = environment.name === defaultSnapshot || environment.id === defaultSnapshot

                        return (
                          <button
                            key={environment.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            title={imageTag}
                            disabled={environmentsLoading}
                            onClick={() => field.handleChange(environment.id)}
                            className={cn(
                              'group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border bg-background p-4 text-left transition-all',
                              'hover:border-foreground/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                              selected &&
                                'border-foreground bg-accent shadow-sm hover:border-foreground hover:bg-accent',
                            )}
                          >
                            <span className="min-w-0 space-y-2.5">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-base font-semibold">
                                  {getEnvironmentLabel(environment)}
                                </span>
                                {isDefault && (
                                  <Badge variant="secondary" className="shrink-0">
                                    default
                                  </Badge>
                                )}
                              </span>

                              <span className="block text-sm text-foreground/70">{description}</span>

                              <span className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto]">
                                <span className="flex min-w-0 items-center gap-2">
                                  <Layers className="size-4 shrink-0" />
                                  <code className="min-w-0 truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
                                    {imageTag}
                                  </code>
                                </span>
                                <span className="flex flex-wrap items-center gap-1">
                                  <ResourceChip resource="cpu" value={resources.cpu} />
                                  <ResourceChip resource="memory" value={resources.memory} />
                                  <ResourceChip resource="disk" value={resources.disk} />
                                </span>
                              </span>
                            </span>

                            <span
                              className={cn(
                                'mt-0.5 flex size-5 items-center justify-center rounded-full border text-transparent transition-colors',
                                selected && 'border-foreground bg-foreground text-background',
                              )}
                              aria-hidden="true"
                            >
                              <CheckCircle2 className="size-3.5" />
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <Accordion
              type="single"
              collapsible
              value={advancedOptionsOpen ? 'advanced-options' : ''}
              onValueChange={(value) => setAdvancedOptionsOpen(value === 'advanced-options')}
              className="mt-3 flex flex-col gap-3"
            >
              <AccordionItem value="advanced-options" className="border-b-0">
                <AccordionTrigger className="py-1 text-sm font-semibold hover:no-underline [&>svg]:size-5">
                  Advanced options
                </AccordionTrigger>
                <AccordionContent className="pb-0 pt-4">
                  <form.Subscribe
                    selector={(state) => state.values.environment}
                    children={(selectedEnvironmentId) => {
                      const selectedEnvironment = environments.find(
                        (environment) => environment.id === selectedEnvironmentId,
                      )
                      const defaultResources = selectedEnvironment
                        ? getEnvironmentResourceSummary(selectedEnvironment)
                        : undefined

                      return (
                        <div className="rounded-md border bg-background p-3">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Resources</Label>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-5 gap-y-3">
                              {RESOURCE_FIELDS.map(({ name, label, unit, Icon }) => {
                                const defaultValue = defaultResources?.[name]

                                return (
                                  <form.Field key={name} name={name}>
                                    {(field) => {
                                      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                                      return (
                                        <div className="min-w-0">
                                          <Label
                                            htmlFor={field.name}
                                            className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                                          >
                                            <Icon className="size-3.5" />
                                            {label}
                                          </Label>
                                          <div className="relative mt-1.5">
                                            <NumericFormat
                                              customInput={Input}
                                              aria-invalid={isInvalid}
                                              id={field.name}
                                              className="h-8 w-full pr-11 text-right font-medium tabular-nums placeholder:font-normal placeholder:text-muted-foreground/45"
                                              placeholder={
                                                focusedAdvancedField === field.name || defaultValue === undefined
                                                  ? ''
                                                  : String(defaultValue)
                                              }
                                              decimalScale={0}
                                              allowNegative={false}
                                              isAllowed={(values) =>
                                                values.floatValue === undefined || values.floatValue >= 1
                                              }
                                              value={field.state.value ?? ''}
                                              onFocus={() => setFocusedAdvancedField(field.name)}
                                              onBlur={() => {
                                                field.handleBlur()
                                                setFocusedAdvancedField((currentField) =>
                                                  currentField === field.name ? null : currentField,
                                                )
                                              }}
                                              onValueChange={(values) => field.handleChange(values.value)}
                                            />
                                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                                              {unit}
                                            </span>
                                          </div>
                                          {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                                            <FieldError errors={field.state.meta.errors} />
                                          )}
                                        </div>
                                      )
                                    }}
                                  </form.Field>
                                )
                              })}
                            </div>
                          </div>

                          <div className="mt-4">
                            <Label className="text-sm font-semibold">Lifecycle</Label>
                            <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-5 gap-y-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
                              <form.Field name="autoStopInterval">
                                {(field) => {
                                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                                  return (
                                    <div className="min-w-0">
                                      <Label htmlFor={field.name} className="text-xs font-medium text-muted-foreground">
                                        Auto-stop
                                      </Label>
                                      <div className="relative mt-1.5">
                                        <NumericFormat
                                          customInput={Input}
                                          aria-invalid={isInvalid}
                                          id={field.name}
                                          className="h-8 w-full pr-10 text-right font-medium tabular-nums placeholder:font-normal placeholder:text-muted-foreground/45"
                                          placeholder={focusedAdvancedField === field.name ? '' : '15'}
                                          decimalScale={0}
                                          allowNegative={false}
                                          value={field.state.value ?? ''}
                                          onFocus={() => setFocusedAdvancedField(field.name)}
                                          onBlur={() => {
                                            field.handleBlur()
                                            setFocusedAdvancedField((currentField) =>
                                              currentField === field.name ? null : currentField,
                                            )
                                          }}
                                          onValueChange={(values) => field.handleChange(values.value)}
                                        />
                                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                                          min
                                        </span>
                                      </div>
                                      {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                                        <FieldError errors={field.state.meta.errors} />
                                      )}
                                    </div>
                                  )
                                }}
                              </form.Field>

                              <form.Field name="autoDeleteInterval">
                                {(field) => {
                                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                                  return (
                                    <div className="min-w-0">
                                      <Label htmlFor={field.name} className="text-xs font-medium text-muted-foreground">
                                        Auto-delete
                                      </Label>
                                      <NumericFormat
                                        customInput={Input}
                                        aria-invalid={isInvalid}
                                        id={field.name}
                                        className="mt-1.5 h-8 w-full text-right font-medium tabular-nums placeholder:font-normal placeholder:text-muted-foreground/45"
                                        placeholder={focusedAdvancedField === field.name ? '' : 'Disabled'}
                                        decimalScale={0}
                                        allowNegative
                                        isAllowed={(values) => {
                                          if (values.floatValue === undefined) return true
                                          return values.floatValue === -1 || values.floatValue >= 0
                                        }}
                                        value={field.state.value ?? ''}
                                        onFocus={() => setFocusedAdvancedField(field.name)}
                                        onBlur={() => {
                                          field.handleBlur()
                                          setFocusedAdvancedField((currentField) =>
                                            currentField === field.name ? null : currentField,
                                          )
                                        }}
                                        onValueChange={(values) => field.handleChange(values.value)}
                                      />
                                      {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                                        <FieldError errors={field.state.meta.errors} />
                                      )}
                                    </div>
                                  )
                                }}
                              </form.Field>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </form>
        </ScrollArea>
        <SheetFooter className="border-t border-border p-5 pt-3 sm:justify-start">
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button
                type="submit"
                form="create-sandbox-form"
                variant="default"
                disabled={isSubmitting || !selectedOrganization?.id || environments.length === 0}
                className="w-full sm:w-auto"
              >
                {isSubmitting && <Spinner />}
                Create
              </Button>
            )}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
