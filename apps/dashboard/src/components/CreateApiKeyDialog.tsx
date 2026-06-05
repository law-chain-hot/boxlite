/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckIcon, CopyIcon, InfoIcon } from 'lucide-react'

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Textarea } from '@/components/ui/textarea'
import { useCreateApiKeyMutation } from '@/hooks/mutations/useCreateApiKeyMutation'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { handleApiError } from '@/lib/error-handling'
import { ApiKeyResponse, CreateApiKeyPermissionsEnum } from '@boxlite-ai/api-client'
import { useForm } from '@tanstack/react-form'
import { Plus } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'

interface CreateApiKeyDialogProps {
  availablePermissions: CreateApiKeyPermissionsEnum[]
  apiUrl: string
  className?: string
  organizationId?: string
}

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  expiresAt: z.date().optional(),
  permissions: z.array(z.enum(CreateApiKeyPermissionsEnum)).min(1, 'At least one permission is required'),
})

type FormValues = z.infer<typeof formSchema>

export const CreateApiKeyDialog: React.FC<CreateApiKeyDialogProps> = ({
  availablePermissions,
  apiUrl,
  className,
  organizationId,
}) => {
  const [open, setOpen] = useState(false)

  const { reset: resetCreateApiKeyMutation, ...createApiKeyMutation } = useCreateApiKeyMutation()

  const form = useForm({
    defaultValues: {
      name: '',
      expiresAt: undefined,
      permissions: availablePermissions,
    } as FormValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      if (!organizationId) {
        toast.error('Select an organization to create an API key.')
        return
      }

      try {
        await createApiKeyMutation.mutateAsync({
          organizationId,
          name: value.name.trim(),
          permissions: value.permissions,
          expiresAt: value.expiresAt ?? null,
        })

        toast.success('API key created successfully')
      } catch (error) {
        handleApiError(error, 'Failed to create API key')
      }
    },
  })

  const resetState = useCallback(() => {
    form.reset({
      name: '',
      expiresAt: undefined,
      permissions: availablePermissions,
    })
    resetCreateApiKeyMutation()
  }, [resetCreateApiKeyMutation, form, availablePermissions])

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  const createdKey = createApiKeyMutation.data

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default" size="sm" title="Create Key" className={className}>
          <Plus className="w-4 h-4" />
          Create Key
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{createdKey ? 'API Key Created' : 'Create New API Key'}</DialogTitle>
          <DialogDescription>
            {createdKey ? 'Your API key has been created successfully.' : 'Create a key for Boxes API access.'}
          </DialogDescription>
        </DialogHeader>
        {createdKey ? (
          <CreatedKeyDisplay createdKey={createdKey} apiUrl={apiUrl} key={createdKey.value} />
        ) : (
          <div className="overflow-y-auto px-1">
            <form
              id="create-api-key-form"
              className="space-y-6"
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
                      <FieldLabel htmlFor={field.name}>Key Name</FieldLabel>
                      <Input
                        aria-invalid={isInvalid}
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Name"
                      />
                      {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="expiresAt">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Expires</FieldLabel>
                    <DatePicker
                      id={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      disabledBefore={new Date()}
                    />
                    <FieldDescription>Optional expiration date for the API key.</FieldDescription>
                  </Field>
                )}
              </form.Field>

              <form.Field name="permissions">
                {(field) => (
                  <Field data-invalid={field.state.meta.isTouched && !field.state.meta.isValid}>
                    <FieldGroup>
                      <Alert variant="info">
                        <InfoIcon />
                        <AlertTitle>Boxes API access</AlertTitle>
                        <AlertDescription>
                          This key can create and manage Boxes. Shared Linux base images are available automatically.
                        </AlertDescription>
                      </Alert>
                    </FieldGroup>
                    {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )}
              </form.Field>
            </form>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
          {!createdKey && (
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  form="create-api-key-form"
                  variant="default"
                  disabled={!canSubmit || isSubmitting || !organizationId || availablePermissions.length === 0}
                >
                  {isSubmitting && <Spinner />}
                  Create
                </Button>
              )}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MotionCopyIcon = motion(CopyIcon)
const MotionCheckIcon = motion(CheckIcon)

const iconProps = {
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
  transition: { duration: 0.1 },
}

function CreatedKeyDisplay({ createdKey, apiUrl }: { createdKey: ApiKeyResponse; apiUrl: string }) {
  const [copiedApiKey, copyApiKey] = useCopyToClipboard()
  const [copiedApiUrl, copyApiUrl] = useCopyToClipboard()

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <InfoIcon />
        <AlertDescription>You can only view this key once. Store it safely.</AlertDescription>
      </Alert>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="api-key">API Key</FieldLabel>

          <div className="relative">
            <Textarea
              id="api-key"
              value={createdKey.value}
              readOnly
              rows={4}
              className="min-h-24 resize-none break-all pr-12 font-mono text-xs leading-5"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Copy API key"
              className="absolute right-2 top-2"
              onClick={() => copyApiKey(createdKey.value)}
            >
              <AnimatePresence initial={false} mode="wait">
                {copiedApiKey ? (
                  <MotionCheckIcon className="h-4 w-4" key="copied" {...iconProps} />
                ) : (
                  <MotionCopyIcon className="h-4 w-4" key="copy" {...iconProps} />
                )}
              </AnimatePresence>
            </Button>
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="api-url">API URL</FieldLabel>

          <InputGroup className="pr-1 flex-1">
            <InputGroupInput id="api-url" value={apiUrl} readOnly />
            <InputGroupButton variant="ghost" size="icon-xs" onClick={() => copyApiUrl(apiUrl)}>
              <AnimatePresence initial={false} mode="wait">
                {copiedApiUrl ? (
                  <MotionCheckIcon className="h-4 w-4" key="copied" {...iconProps} />
                ) : (
                  <MotionCopyIcon className="h-4 w-4" key="copy" {...iconProps} />
                )}
              </AnimatePresence>
            </InputGroupButton>
          </InputGroup>
        </Field>
      </FieldGroup>
    </div>
  )
}
