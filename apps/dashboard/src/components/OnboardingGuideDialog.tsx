/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import pythonIcon from '@/assets/python.svg'
import typescriptIcon from '@/assets/typescript.svg'
import CodeBlock from '@/components/CodeBlock'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyableValue } from '@/components/ui/copyable-value'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BOXLITE_DOCS_URL } from '@/constants/ExternalLinks'
import { RoutePath } from '@/enums/RoutePath'
import { useApi } from '@/hooks/useApi'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { cn, getMaskedToken } from '@/lib/utils'
import { ApiKeyResponse, CreateApiKeyPermissionsEnum, OrganizationRolePermissionsEnum } from '@boxlite-ai/api-client'
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ClipboardIcon,
  Code2,
  Eye,
  EyeOff,
  KeyRound,
  ListChecks,
  Loader2,
  LockKeyhole,
  MapPin,
  Package,
  Play,
  Plus,
  Terminal,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

interface OnboardingGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart: () => void
}

interface OnboardingStep {
  title: string
  description: string
  icon: LucideIcon
}

type OnboardingLanguage = 'python' | 'typescript' | 'go' | 'cli'

const onboardingSteps: OnboardingStep[] = [
  {
    title: 'Create a Box',
    description: 'Name it, choose a Linux base image, and start from safe defaults.',
    icon: Play,
  },
  {
    title: 'Use the terminal',
    description: 'Open the Box detail page and run commands in the browser.',
    icon: Terminal,
  },
  {
    title: 'Install the SDK',
    description: 'Use Python, TypeScript, Go, or the CLI from the original onboarding path.',
    icon: Package,
  },
  {
    title: 'Create an API Key',
    description: 'Generate a scoped key for creating and cleaning up Boxes from code.',
    icon: KeyRound,
  },
  {
    title: 'Run the example',
    description: 'Create a Box, execute a command, and remove it when finished.',
    icon: Box,
  },
]

const defaultSettings = [
  {
    label: 'Linux base image',
    value: 'Ubuntu 24.04 LTS by default',
    icon: Box,
  },
  {
    label: 'Region',
    value: 'Default Organization region',
    icon: MapPin,
  },
  {
    label: 'HTTP preview',
    value: 'Private by default',
    icon: LockKeyhole,
  },
]

const languageOptions: {
  value: OnboardingLanguage
  label: string
  icon?: string
  Icon?: LucideIcon
}[] = [
  { value: 'python', label: 'Python', icon: pythonIcon },
  { value: 'typescript', label: 'TypeScript', icon: typescriptIcon },
  { value: 'go', label: 'Go', Icon: Code2 },
  { value: 'cli', label: 'CLI', Icon: Terminal },
]

const codeExamples: Record<
  OnboardingLanguage,
  { install: string; run: string; example: string; codeLanguage: string }
> = {
  typescript: {
    install: 'npm install @boxlite-ai/boxlite',
    run: 'npx tsx index.mts',
    codeLanguage: 'typescript',
    example: `import { JsBoxlite, BoxliteRestOptions, ApiKeyCredential } from '@boxlite-ai/boxlite'

// Connect to BoxLite Cloud with your API key
const rt = JsBoxlite.rest(new BoxliteRestOptions({
  url: 'your-api-url',
  credential: new ApiKeyCredential('your-api-key'),
}))

// Or discover from the environment (reads BOXLITE_API_KEY):
// const rt = JsBoxlite.rest(new BoxliteRestOptions({
//   url: 'your-api-url',
//   credential: ApiKeyCredential.fromEnv() ?? undefined,
// }))

// Create a Box from an approved Linux base image
const box = await rt.create({ image: 'ubuntu:24.04' }, 'my-box')
await box.start()

// Run a command securely inside the Box
const exec = await box.exec('echo', ['Hello World!'])
const result = await exec.wait()
console.log('Exit code:', result.exitCode)

// Cleanup
await rt.remove(box.id, true)`,
  },
  python: {
    install: 'pip install boxlite',
    run: 'python main.py',
    codeLanguage: 'python',
    example: `import asyncio
from boxlite import Boxlite, BoxliteRestOptions, BoxOptions, ApiKeyCredential

async def main():
    # Connect to BoxLite Cloud with your API key
    rt = Boxlite.rest(BoxliteRestOptions(
        url="your-api-url",
        credential=ApiKeyCredential("your-api-key"),
    ))

    # Or discover from the environment
    # (reads BOXLITE_REST_URL + BOXLITE_API_KEY):
    # rt = Boxlite.rest(BoxliteRestOptions.from_env())

    # Create a Box from an approved Linux base image
    box = await rt.create(BoxOptions(image="ubuntu:24.04"), name="my-box")
    await box.start()

    # Run a command securely inside the Box
    execution = await box.exec("echo", args=["Hello World!"])
    result = await execution.wait()
    print(f"Exit code: {result.exit_code}")

    # Cleanup
    await rt.remove(box.id, force=True)

asyncio.run(main())`,
  },
  go: {
    install: `go get github.com/boxlite-ai/boxlite/sdks/go
go run github.com/boxlite-ai/boxlite/sdks/go/cmd/setup`,
    run: 'go run .',
    codeLanguage: 'go',
    example: `package main

import (
    "context"
    "fmt"
    "log"

    boxlite "github.com/boxlite-ai/boxlite/sdks/go"
)

func main() {
    ctx := context.Background()

    // Connect to BoxLite Cloud with your API key
    rt, err := boxlite.NewRest(boxlite.BoxliteRestOptions{
        URL:        "your-api-url",
        Credential: boxlite.NewApiKeyCredential("your-api-key"),
    })
    if err != nil {
        log.Fatal(err)
    }
    defer rt.Close()

    // Create a Box from an approved Linux base image
    box, err := rt.Create(ctx, "ubuntu:24.04", boxlite.WithName("my-box"))
    if err != nil {
        log.Fatal(err)
    }

    if err := box.Start(ctx); err != nil {
        log.Fatal(err)
    }

    // Run a command securely inside the Box
    result, err := box.Exec(ctx, "echo", "Hello World!")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Exit code:", result.ExitCode)
    fmt.Print(result.Stdout)

    // Cleanup
    if err := rt.ForceRemove(ctx, box.ID()); err != nil {
        log.Fatal(err)
    }
}`,
  },
  cli: {
    install: 'curl -fsSL https://sh.boxlite.ai | sh',
    run: 'boxlite run --rm ubuntu:24.04 echo "Hello World!"',
    codeLanguage: 'bash',
    example: `# Authenticate once with the API key created in the dashboard
echo "your-api-key" | boxlite auth login --api-key-stdin --url "your-api-url"

# Create a Box from an approved Linux base image, run a command, and clean up
boxlite run --rm ubuntu:24.04 echo "Hello World!"

# Or keep the Box around for later
boxlite create --name my-box ubuntu:24.04
boxlite start my-box
boxlite exec my-box echo "Hello World!"
boxlite rm -f my-box`,
  },
}

export function OnboardingGuideDialog({ open, onOpenChange, onStart }: OnboardingGuideDialogProps) {
  const { apiKeyApi } = useApi()
  const { apiUrl } = useConfig()
  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()
  const [activeStep, setActiveStep] = useState(0)
  const [language, setLanguage] = useState<OnboardingLanguage>('python')
  const [apiKeyName, setApiKeyName] = useState('')
  const [createdApiKey, setCreatedApiKey] = useState<ApiKeyResponse | null>(null)
  const [isApiKeyRevealed, setIsApiKeyRevealed] = useState(false)
  const [isApiKeyCopied, setIsApiKeyCopied] = useState(false)
  const [isLoadingCreateKey, setIsLoadingCreateKey] = useState(false)
  const isLastStep = activeStep === onboardingSteps.length - 1

  const canCreateApiKey = authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_SANDBOXES)
  const apiKeyPermissions = useMemo(() => {
    if (!canCreateApiKey) return []

    const permissions: CreateApiKeyPermissionsEnum[] = [CreateApiKeyPermissionsEnum.WRITE_SANDBOXES]
    if (authenticatedUserHasPermission(OrganizationRolePermissionsEnum.DELETE_SANDBOXES)) {
      permissions.push(CreateApiKeyPermissionsEnum.DELETE_SANDBOXES)
    }

    return permissions
  }, [authenticatedUserHasPermission, canCreateApiKey])

  const activeExample = codeExamples[language]
  const renderedExample = useMemo(() => {
    const apiKey = createdApiKey && isApiKeyRevealed ? createdApiKey.value : 'your-api-key'
    return activeExample.example.replaceAll('your-api-url', apiUrl).replaceAll('your-api-key', apiKey)
  }, [activeExample.example, apiUrl, createdApiKey, isApiKeyRevealed])

  useEffect(() => {
    if (open) {
      setActiveStep(0)
    }
  }, [open])

  useEffect(() => {
    setCreatedApiKey(null)
    setApiKeyName('')
    setIsApiKeyRevealed(false)
    setIsApiKeyCopied(false)
  }, [selectedOrganization?.id])

  const goNext = () => setActiveStep((step) => Math.min(step + 1, onboardingSteps.length - 1))
  const goBack = () => setActiveStep((step) => Math.max(step - 1, 0))

  const handleStartCreate = () => {
    onOpenChange(false)
    window.setTimeout(onStart, 120)
  }

  const handleCreateApiKey = async () => {
    if (!selectedOrganization || !canCreateApiKey || apiKeyPermissions.length === 0) {
      return
    }

    setIsLoadingCreateKey(true)
    try {
      const key = (
        await apiKeyApi.createApiKey(
          {
            name: apiKeyName,
            permissions: apiKeyPermissions,
          },
          selectedOrganization.id,
        )
      ).data
      setCreatedApiKey(key)
      setApiKeyName('')
      toast.success('API key created successfully')
    } catch (error) {
      handleApiError(error, 'Failed to create API key')
    } finally {
      setIsLoadingCreateKey(false)
    }
  }

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setIsApiKeyCopied(true)
      setTimeout(() => setIsApiKeyCopied(false), 2000)
    } catch (error) {
      handleApiError(error, 'Failed to copy API key')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(840px,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[980px]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 sm:px-6 sm:py-5 sm:pr-14">
          <div className="grid gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border bg-muted text-foreground">
                <ListChecks className="size-4" />
              </div>
              <div className="grid gap-1">
                <DialogTitle className="text-2xl">Get Started</DialogTitle>
                <DialogDescription>
                  Create your first Box in the dashboard, then use the SDK or CLI path from the original onboarding when
                  you are ready to consume it from code.
                </DialogDescription>
              </div>
            </div>

            <Tabs
              value={language}
              onValueChange={(value) => setLanguage(value as OnboardingLanguage)}
              className="w-full"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-grid sm:w-auto sm:grid-cols-4">
                {languageOptions.map((option) => (
                  <TabsTrigger key={option.value} value={option.value} className="h-8 gap-2 px-3">
                    {option.icon ? (
                      <img src={option.icon} alt="" className="size-4" />
                    ) : option.Icon ? (
                      <option.Icon className="size-4" />
                    ) : null}
                    <span>{option.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="max-h-56 shrink-0 overflow-auto border-b border-border bg-muted/25 p-3 sm:p-4 md:max-h-none md:border-b-0 md:border-r">
            <div className="grid gap-2">
              {onboardingSteps.map((step, index) => {
                const Icon = step.icon
                const isActive = index === activeStep
                const isComplete = index < activeStep

                return (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => setActiveStep(index)}
                    className={cn(
                      'grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-md p-3 text-left transition-colors',
                      isActive ? 'bg-background shadow-sm ring-1 ring-border' : 'hover:bg-background/70',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border bg-background text-xs font-medium',
                        isActive && 'border-foreground text-foreground',
                        isComplete && 'border-success bg-success text-background',
                      )}
                    >
                      {isComplete ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{step.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{step.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6 sm:py-5">
            <div key={activeStep} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
              {activeStep === 0 && (
                <div className="grid gap-5">
                  <div>
                    <Badge variant="secondary">Step 1</Badge>
                    <h3 className="mt-3 text-xl font-semibold">Create a Linux Box</h3>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      For the MVP, users only choose a name and one approved Linux base image. Region, networking, and
                      lifecycle defaults stay controlled by the system.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {defaultSettings.map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.label} className="rounded-md border bg-background p-4">
                          <div className="mb-3 flex size-8 items-center justify-center rounded-md border bg-muted">
                            <Icon className="size-4 text-muted-foreground" />
                          </div>
                          <div className="text-sm font-medium">{item.label}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{item.value}</div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="rounded-md border bg-muted/30 p-4">
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Create form
                    </div>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-[1fr_1fr]">
                      <div className="rounded-md border bg-background p-3">
                        <div className="text-muted-foreground">Name</div>
                        <div className="mt-1 font-medium">my-box</div>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <div className="text-muted-foreground">Base image</div>
                        <div className="mt-1 font-medium">Ubuntu 24.04 LTS</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 1 && (
                <div className="grid gap-5">
                  <div>
                    <Badge variant="secondary">Step 2</Badge>
                    <h3 className="mt-3 text-xl font-semibold">Use the terminal</h3>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      After creation, the user lands on the Box detail page with Terminal selected. This is the fastest
                      way to prove the Box is running and usable.
                    </p>
                  </div>

                  <div className="rounded-md border bg-code-background p-4 text-sm">
                    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Terminal className="size-4" />
                      box terminal
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-foreground">
                      {`$ uname -a
Linux my-box 6.x

$ echo "hello from boxlite"
hello from boxlite`}
                    </pre>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border bg-background p-4">
                      <div className="text-sm font-medium">Expected action</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Run commands, inspect files, and verify output.
                      </p>
                    </div>
                    <div className="rounded-md border bg-background p-4">
                      <div className="text-sm font-medium">Expected state</div>
                      <p className="mt-1 text-sm text-muted-foreground">The Box should be running.</p>
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 2 && (
                <div className="grid gap-5">
                  <div>
                    <Badge variant="secondary">Step 3</Badge>
                    <h3 className="mt-3 text-xl font-semibold">Install the SDK</h3>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      Run the following command in your terminal to install the BoxLite SDK.
                    </p>
                  </div>

                  <CodeBlock code={activeExample.install} language="bash" showCopy />

                  <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                    The language switcher in the header updates the install command and example code.
                  </div>
                </div>
              )}

              {activeStep === 3 && (
                <div className="grid gap-5">
                  <div>
                    <Badge variant="secondary">Step 4</Badge>
                    <h3 className="mt-3 text-xl font-semibold">Create an API Key</h3>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      This API key will have permissions to only{' '}
                      {apiKeyPermissions.includes(CreateApiKeyPermissionsEnum.DELETE_SANDBOXES) ? 'manage' : 'create'}{' '}
                      Boxes. For full API permissions, head to the{' '}
                      <Link to={RoutePath.KEYS} className="underline underline-offset-4 hover:text-foreground">
                        API Keys
                      </Link>{' '}
                      page.
                    </p>
                  </div>

                  {createdApiKey ? (
                    <CopyableValue
                      className="p-4"
                      displayValue={isApiKeyRevealed ? createdApiKey.value : getMaskedToken(createdApiKey.value)}
                      actionsClassName="gap-3"
                      actions={
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={isApiKeyRevealed ? 'Hide API key' : 'Reveal API key'}
                            className="h-6 w-6 text-current hover:bg-green-200/70 hover:text-current dark:hover:bg-green-800/70"
                            onClick={() => setIsApiKeyRevealed(!isApiKeyRevealed)}
                          >
                            {isApiKeyRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          {isApiKeyCopied ? (
                            <Check className="h-4 w-4 shrink-0" />
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Copy API key"
                              className="h-6 w-6 text-current hover:bg-green-200/70 hover:text-current dark:hover:bg-green-800/70"
                              onClick={() => copyToClipboard(createdApiKey.value)}
                            >
                              <ClipboardIcon className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      }
                    />
                  ) : canCreateApiKey ? (
                    <form
                      className="grid gap-3 rounded-md border bg-background p-4"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        await handleCreateApiKey()
                      }}
                    >
                      <label htmlFor="onboarding-key-name" className="text-sm font-medium">
                        API Key Name
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="onboarding-key-name"
                          type="text"
                          value={apiKeyName}
                          onChange={(event) => setApiKeyName(event.target.value)}
                          required
                          placeholder="e.g. Onboarding"
                          disabled={isLoadingCreateKey}
                          className="flex-1"
                        />
                        <Button type="submit" disabled={isLoadingCreateKey}>
                          {isLoadingCreateKey ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Plus className="size-4" />
                          )}
                          Create API Key
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="rounded-md border bg-muted/30 p-4">
                      <div className="text-sm font-medium">API key creation is not available for this user.</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        You need permission to create Boxes before generating this onboarding key.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeStep === 4 && (
                <div className="grid gap-5">
                  <div>
                    <Badge variant="secondary">Step 5</Badge>
                    <h3 className="mt-3 text-xl font-semibold">Create a Box and run the example</h3>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      The example below creates a Box, runs a simple command, and cleans it up when finished.
                    </p>
                  </div>

                  <CodeBlock
                    code={renderedExample}
                    language={activeExample.codeLanguage}
                    showCopy
                    codeAreaClassName="max-h-[320px] text-xs"
                  />

                  <div>
                    <div className="mb-2 text-sm font-medium">Run the example</div>
                    <CodeBlock code={activeExample.run} language="bash" showCopy />
                  </div>

                  <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                    That's it. For more examples, check out{' '}
                    <a href={BOXLITE_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-primary">
                      Docs
                    </a>
                    .
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-5 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Later
          </Button>
          <div className="flex flex-1 items-center justify-end gap-2">
            <Button variant="ghost" onClick={goBack} disabled={activeStep === 0}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            {activeStep === 0 ? (
              <>
                <Button variant="outline" onClick={goNext}>
                  Next
                  <ArrowRight className="size-4" />
                </Button>
                <Button onClick={handleStartCreate}>Create Box</Button>
              </>
            ) : isLastStep ? (
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            ) : (
              <Button onClick={goNext}>
                Next
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
