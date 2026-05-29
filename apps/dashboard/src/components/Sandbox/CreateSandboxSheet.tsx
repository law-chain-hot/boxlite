/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { FeatureFlags } from '@/enums/FeatureFlags'
import { RoutePath } from '@/enums/RoutePath'
import { useCreateSandboxFromEnvironmentMutation } from '@/hooks/mutations/useCreateSandboxFromEnvironmentMutation'
import { useEnvironmentsQuery } from '@/hooks/queries/useEnvironmentsQuery'
import type { Environment } from '@/hooks/queries/useEnvironmentsQuery'
import { useConfig } from '@/hooks/useConfig'
import { useIsCompactScreen } from '@/hooks/use-mobile'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { cn } from '@/lib/utils'
import { useForm } from '@tanstack/react-form'
import { Plus } from 'lucide-react'
import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createSearchParams, generatePath, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { ScrollArea } from '../ui/scroll-area'

const NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

const formSchema = z.object({
  name: z
    .string()
    .optional()
    .refine((val) => !val || NAME_REGEX.test(val), 'Only letters, digits, dots, underscores and dashes are allowed'),
  environment: z.string().min(1, 'Select an environment'),
})

type FormValues = z.input<typeof formSchema>

const defaultValues: FormValues = {
  name: '',
  environment: '',
}

const getEnvironmentLabel = (environment: Environment) =>
  environment.displayName || environment.imageName || environment.name

export const CreateSandboxSheet = ({
  className,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  className?: string
  triggerClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) => {
  const navigate = useNavigate()
  const isCompactScreen = useIsCompactScreen()
  const createSandboxEnabled = useFeatureFlagEnabled(FeatureFlags.DASHBOARD_CREATE_SANDBOX)
  const [internalOpen, setInternalOpen] = useState(false)
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
        toast.error('Select an organization to create a sandbox.')
        return
      }

      if (!value.environment) {
        toast.error('Select an environment to create a sandbox.')
        return
      }

      let sandboxId: string | undefined = undefined
      try {
        const sandbox = await createSandboxMutation.mutateAsync({
          name: value.name?.trim() || undefined,
          environmentId: value.environment,
          public: false,
          networkBlockAll: false,
        })
        sandboxId = sandbox.id

        toast.success('Sandbox created')
        setOpen(false)

        if (sandboxId) {
          navigate({
            pathname: generatePath(RoutePath.SANDBOX_DETAILS, { sandboxId }),
            search: `${createSearchParams({
              tab: 'terminal',
            })}`,
          })
        }
      } catch (error) {
        handleApiError(error, 'Failed to create sandbox')
      }
    },
  })

  const resetState = useCallback(() => {
    form.reset(defaultValues)
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

  if (!createSandboxEnabled) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="default" size="sm" title="Create Sandbox" className={cn('w-full sm:w-auto', triggerClassName)}>
          <Plus className="size-4" />
          <span>{isCompactScreen ? 'Create' : 'Create Sandbox'}</span>
        </Button>
      </SheetTrigger>
      <SheetContent className={`w-dvw sm:w-[440px] p-0 flex flex-col gap-0 ${className ?? ''}`}>
        <SheetHeader className="border-b border-border p-4 px-5 items-center flex text-left flex-row">
          <SheetTitle className="text-2xl">Create Sandbox</SheetTitle>
          <SheetDescription className="sr-only">Create a new sandbox in your organization.</SheetDescription>
        </SheetHeader>
        <ScrollArea fade="mask" className="flex-1 min-h-0">
          <form
            ref={formRef}
            id="create-sandbox-form"
            className="gap-6 flex flex-col p-5"
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
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="my-sandbox"
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
                    <FieldLabel htmlFor={field.name}>Environment</FieldLabel>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger
                        aria-invalid={isInvalid}
                        className="h-8"
                        id={field.name}
                        disabled={environmentsLoading || environments.length === 0}
                        loading={environmentsLoading}
                      >
                        <SelectValue
                          placeholder={environmentsLoading ? 'Loading environments...' : 'Select an environment'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {environments.map((environment) => (
                          <SelectItem key={environment.id} value={environment.id}>
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate">{getEnvironmentLabel(environment)}</span>
                              {(environment.name === defaultSnapshot || environment.id === defaultSnapshot) && (
                                <Badge variant="secondary" className="shrink-0">
                                  default
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {environments.length > 0 && (
                      <FieldDescription>
                        {environments.find((env) => env.id === field.state.value)?.cpu ?? 1} vCPU /{' '}
                        {environments.find((env) => env.id === field.state.value)?.mem ?? 1} GiB RAM /{' '}
                        {environments.find((env) => env.id === field.state.value)?.disk ?? 3} GiB disk
                      </FieldDescription>
                    )}
                    {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
          </form>
        </ScrollArea>
        <SheetFooter className="p-5 pt-3 border-t border-border sm:justify-start">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                form="create-sandbox-form"
                variant="default"
                disabled={!canSubmit || isSubmitting || !selectedOrganization?.id || environments.length === 0}
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
