/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import goIcon from '@/assets/go.svg'
import pythonIcon from '@/assets/python.svg'
import rustIcon from '@/assets/rust.svg'
import typescriptIcon from '@/assets/typescript.svg'
import CodeBlock from '@/components/CodeBlock'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyableValue } from '@/components/ui/copyable-value'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BOXLITE_DOCS_URL } from '@/constants/ExternalLinks'
import { useApi } from '@/hooks/useApi'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { getOnboardingCoreProgress, type OnboardingProgress } from '@/lib/onboarding-progress'
import { cn, getMaskedToken } from '@/lib/utils'
import {
  CreateApiKeyPermissionsEnum,
  OrganizationRolePermissionsEnum,
  type ApiKeyResponse,
} from '@boxlite-ai/api-client'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardIcon,
  Code2,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  Loader2,
  Play,
  Plus,
  Power,
  Terminal,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

interface OnboardingGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateBox: () => void
  onOpenTerminal: () => void
  onProgressChange: (progress: OnboardingProgress) => void
  progress: OnboardingProgress
  hasBoxes: boolean
  initialStep?: OnboardingStepId
  onInitialStepConsumed?: () => void
}

type OnboardingLanguage = 'python' | 'typescript' | 'go' | 'rust' | 'cli'
export type OnboardingStepId = 'create' | 'terminal' | 'sdk'
type StepStatus = 'complete' | 'visited' | 'active' | 'optional' | 'locked'
type OnboardingStepPhase = 'setup' | 'next'

interface OnboardingLanguageOption {
  value: OnboardingLanguage
  label: string
  iconSrc?: string
  Icon?: LucideIcon
}

interface OnboardingStep {
  id: OnboardingStepId
  number?: number
  phase: OnboardingStepPhase
  title: string
  description: string
  Icon: LucideIcon
}

const terminalExample = `$ echo "hello from boxlite"
hello from boxlite

$ uname -a
Linux my-box 6.x`

const stepOrder: OnboardingStepId[] = ['create', 'terminal', 'sdk']

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'create',
    number: 1,
    phase: 'setup',
    title: 'Create Box',
    description: 'Start from a shared Linux base image.',
    Icon: Play,
  },
  {
    id: 'terminal',
    number: 2,
    phase: 'setup',
    title: 'Run a command',
    description: 'Confirm the Box can execute work.',
    Icon: Terminal,
  },
  {
    id: 'sdk',
    phase: 'next',
    title: 'Connect SDK',
    description: 'Optional code automation path.',
    Icon: Code2,
  },
]

const setupSteps = onboardingSteps.filter((step) => step.phase === 'setup')
const nextSteps = onboardingSteps.filter((step) => step.phase === 'next')

const languageOptions: OnboardingLanguageOption[] = [
  { value: 'python', label: 'Python', iconSrc: pythonIcon },
  { value: 'typescript', label: 'TypeScript', iconSrc: typescriptIcon },
  { value: 'go', label: 'Go', iconSrc: goIcon },
  { value: 'rust', label: 'Rust', iconSrc: rustIcon },
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

const rt = JsBoxlite.rest(new BoxliteRestOptions({
  url: 'your-api-url',
  credential: new ApiKeyCredential('your-api-key'),
}))

const box = await rt.create({ image: 'ubuntu:24.04' }, 'my-box')
await box.start()

const exec = await box.exec('echo', ['Hello World!'])
const stdout = await exec.stdout()
let output = ''
let chunk: string | null
while ((chunk = await stdout.next()) !== null) {
  output += chunk
}
const result = await exec.wait()
console.log('Exit code:', result.exitCode)
console.log(output)

await rt.remove(box.id, true)`,
  },
  python: {
    install: 'pip install boxlite',
    run: 'python main.py',
    codeLanguage: 'python',
    example: `import asyncio
from boxlite import Boxlite, BoxliteRestOptions, BoxOptions, ApiKeyCredential

async def main():
    rt = Boxlite.rest(BoxliteRestOptions(
        url="your-api-url",
        credential=ApiKeyCredential("your-api-key"),
    ))

    box = await rt.create(BoxOptions(image="ubuntu:24.04"), name="my-box")
    await box.start()

    execution = await box.exec("echo", args=["Hello World!"])
    output = ""
    async for line in execution.stdout():
        output += line
    result = await execution.wait()
    print(f"Exit code: {result.exit_code}")
    print(output)

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
    rt, err := boxlite.NewRest(boxlite.BoxliteRestOptions{
        URL:        "your-api-url",
        Credential: boxlite.NewApiKeyCredential("your-api-key"),
    })
    if err != nil {
        log.Fatal(err)
    }
    defer rt.Close()

    box, err := rt.Create(ctx, "ubuntu:24.04", boxlite.WithName("my-box"))
    if err != nil {
        log.Fatal(err)
    }
    if err := box.Start(ctx); err != nil {
        log.Fatal(err)
    }

    result, err := box.Exec(ctx, "echo", "Hello World!")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Exit code:", result.ExitCode)
    fmt.Print(result.Stdout)

    if err := rt.ForceRemove(ctx, box.ID()); err != nil {
        log.Fatal(err)
    }
}`,
  },
  rust: {
    install: `cargo add boxlite --features rest
cargo add tokio --features macros,rt-multi-thread
cargo add futures`,
    run: 'cargo run',
    codeLanguage: 'rust',
    example: `use boxlite::{BoxCommand, BoxOptions, BoxliteRestOptions, BoxliteRuntime, RootfsSpec};
use futures::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let rt = BoxliteRuntime::rest(
        BoxliteRestOptions::new("your-api-url").with_api_key("your-api-key"),
    )?;

    let options = BoxOptions {
        rootfs: RootfsSpec::Image("ubuntu:24.04".into()),
        ..Default::default()
    };
    let box_handle = rt.create(options, Some("my-box".into())).await?;
    box_handle.start().await?;

    let exec = box_handle
        .exec(BoxCommand::new("echo").arg("Hello World!"))
        .await?;
    let mut stdout = exec.stdout().expect("stdout stream should be available");
    let mut output = String::new();
    while let Some(line) = stdout.next().await {
        output.push_str(&line);
    }
    let result = exec.wait().await?;
    println!("Exit code: {}", result.exit_code);
    print!("{output}");

    rt.remove(&box_handle.id().to_string(), true).await?;
    Ok(())
}`,
  },
  cli: {
    install: 'curl -fsSL https://sh.boxlite.ai | sh',
    run: 'boxlite run --rm ubuntu:24.04 echo "Hello World!"',
    codeLanguage: 'bash',
    example: `echo "your-api-key" | boxlite auth login --api-key-stdin --url "your-api-url"

boxlite run --rm ubuntu:24.04 echo "Hello World!"

boxlite create --name my-box ubuntu:24.04
boxlite start my-box
boxlite exec my-box -- echo "Hello World!"
boxlite rm -f my-box`,
  },
}

function LanguageOptionIcon({ option }: { option: OnboardingLanguageOption }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      {option.iconSrc ? (
        <img src={option.iconSrc} alt="" className="size-3.5" />
      ) : option.Icon ? (
        <option.Icon className="size-3.5" strokeWidth={1.75} />
      ) : null}
    </span>
  )
}

function getSuggestedStep(progress: OnboardingProgress, hasBoxes: boolean): OnboardingStepId {
  if (!progress.boxCreated && !hasBoxes) return 'create'
  if (!progress.commandRan) return 'terminal'
  if (!progress.sdkConnected) return 'sdk'
  return 'terminal'
}

function getStepStatus(
  stepId: OnboardingStepId,
  activeStep: OnboardingStepId,
  progress: OnboardingProgress,
  hasBoxes: boolean,
): StepStatus {
  const boxReady = Boolean(progress.boxCreated || hasBoxes)

  if (stepId === 'create') return boxReady ? 'complete' : activeStep === stepId ? 'active' : 'locked'
  if (stepId === 'terminal') {
    if (progress.commandRan) return 'complete'
    if (!boxReady) return 'locked'
    return activeStep === stepId ? 'active' : 'optional'
  }
  if (!progress.commandRan) return 'locked'
  if (stepId === 'sdk') {
    if (progress.sdkConnected) return 'visited'
    return activeStep === stepId ? 'active' : 'optional'
  }
  return activeStep === stepId ? 'active' : 'optional'
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium">{label}</span>
      <span className="min-w-0 truncate text-muted-foreground">{value}</span>
    </div>
  )
}

export function OnboardingGuideDialog({
  open,
  onOpenChange,
  onCreateBox,
  onOpenTerminal,
  onProgressChange,
  progress,
  hasBoxes,
  initialStep,
  onInitialStepConsumed,
}: OnboardingGuideDialogProps) {
  const { apiKeyApi } = useApi()
  const { apiUrl } = useConfig()
  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()
  const [activeStep, setActiveStep] = useState<OnboardingStepId>('create')
  const [language, setLanguage] = useState<OnboardingLanguage>('python')
  const [apiKeyName, setApiKeyName] = useState('')
  const [createdApiKey, setCreatedApiKey] = useState<ApiKeyResponse | null>(null)
  const [isApiKeyRevealed, setIsApiKeyRevealed] = useState(false)
  const [isApiKeyCopied, setIsApiKeyCopied] = useState(false)
  const [isLoadingCreateKey, setIsLoadingCreateKey] = useState(false)
  const wasOpenRef = useRef(false)
  const coreProgress = getOnboardingCoreProgress(progress, hasBoxes)
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
  const activeStepIndex = stepOrder.indexOf(activeStep)
  const activeStepConfig = onboardingSteps.find((step) => step.id === activeStep) ?? onboardingSteps[0]
  const canFinishGuide = coreProgress.isComplete
  const activeStepTitle =
    activeStepConfig.phase === 'setup' && activeStepConfig.number
      ? `${activeStepConfig.number}. ${activeStepConfig.title}`
      : activeStepConfig.title
  const nextButtonLabel = activeStep === 'terminal' && canFinishGuide ? 'Set up SDK' : 'Next'
  const nextStep = activeStepIndex < stepOrder.length - 1 ? stepOrder[activeStepIndex + 1] : undefined
  const isNextStepLocked = nextStep ? getStepStatus(nextStep, activeStep, progress, hasBoxes) === 'locked' : false
  const renderedExample = useMemo(() => {
    const apiKey = createdApiKey && isApiKeyRevealed ? createdApiKey.value : 'your-api-key'
    return activeExample.example.replaceAll('your-api-url', apiUrl).replaceAll('your-api-key', apiKey)
  }, [activeExample.example, apiUrl, createdApiKey, isApiKeyRevealed])

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setActiveStep(initialStep ?? getSuggestedStep(progress, hasBoxes))
      if (initialStep) {
        onInitialStepConsumed?.()
      }
    }
    wasOpenRef.current = open
  }, [
    hasBoxes,
    initialStep,
    onInitialStepConsumed,
    open,
    progress.boxCreated,
    progress.commandRan,
    progress.sdkConnected,
    progress.terminalOpened,
  ])

  useEffect(() => {
    setCreatedApiKey(null)
    setApiKeyName('')
    setIsApiKeyRevealed(false)
    setIsApiKeyCopied(false)
  }, [selectedOrganization?.id])

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
      onProgressChange({ sdkConnected: true })
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

  const goToPreviousStep = () => {
    if (activeStepIndex > 0) {
      setActiveStep(stepOrder[activeStepIndex - 1])
    }
  }

  const goToNextStep = () => {
    if (activeStepIndex < stepOrder.length - 1) {
      setActiveStep(stepOrder[activeStepIndex + 1])
    }
  }

  const renderCreateStep = () => (
    <div className="grid gap-5">
      <div>
        <h3 className="text-xl font-semibold">Create a Linux Box</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Start with the default Box settings. BoxLite keeps the base image, region, networking, and lifecycle defaults
          controlled unless you intentionally open advanced options.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <InfoRow icon={Layers3} label="Image" value="Ubuntu 24.04 LTS" />
        <InfoRow icon={Power} label="HTTP" value="Private preview" />
        <InfoRow icon={Play} label="Region" value="Default region" />
      </div>

      <div className="rounded-md border bg-muted/20 p-4">
        <div className="text-sm font-medium">Start here</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Create Box opens the side panel. If you cancel, this guide resumes here. If you create a Box, the next step is
          the terminal.
        </p>
        <Button className="mt-4" onClick={onCreateBox}>
          <Plus className="size-4" />
          Create Box
        </Button>
      </div>
    </div>
  )

  const renderTerminalStep = () => (
    <div className="grid gap-5">
      <div>
        <h3 className="text-xl font-semibold">Use the Box</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Run one command in the browser terminal, then confirm it here. That is the setup finish line.
        </p>
      </div>

      <CodeBlock code={terminalExample} language="bash" showCopy codeAreaClassName="whitespace-pre-wrap" />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onOpenTerminal} disabled={!hasBoxes && !progress.boxCreated}>
          Open Terminal
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onProgressChange({ terminalOpened: true, commandRan: true })}
          disabled={!hasBoxes && !progress.boxCreated}
        >
          I ran this command
        </Button>
      </div>
    </div>
  )

  const renderSdkStep = () => (
    <div className="grid min-w-0 gap-5">
      <div className="grid gap-4">
        <div>
          <h3 className="text-xl font-semibold">Connect SDK</h3>
          <Badge variant="outline" className="mt-3">
            Optional
          </Badge>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Use this path when you want to create, run, and clean up Boxes from code.
          </p>
        </div>

        <Tabs
          value={language}
          onValueChange={(value) => setLanguage(value as OnboardingLanguage)}
          className="min-w-0 items-end"
        >
          <TabsList className="ml-auto flex h-auto w-fit max-w-full flex-wrap justify-end gap-1 rounded-md border bg-muted/40 p-1">
            {languageOptions.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="h-9 gap-2 rounded-sm border border-transparent px-3 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground data-[state=active]:bg-muted-foreground/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:bg-muted-foreground/30"
              >
                <LanguageOptionIcon option={option} />
                <span className="whitespace-nowrap">{option.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid min-w-0 gap-4 rounded-md border bg-muted/15 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-muted-foreground" />
          API key
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
            className="grid gap-3"
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
                {isLoadingCreateKey ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create API Key
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            API key creation is not available for this user.
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-4">
        <div>
          <div className="mb-2 text-sm font-medium">Install</div>
          <CodeBlock code={activeExample.install} language="bash" showCopy />
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Example</div>
          <CodeBlock
            code={renderedExample}
            language={activeExample.codeLanguage}
            showCopy
            codeAreaClassName="max-h-[280px] text-xs"
          />
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Run</div>
          <CodeBlock code={activeExample.run} language="bash" showCopy />
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        More examples are available in{' '}
        <a href={BOXLITE_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-primary">
          Docs
        </a>
        .
      </div>
    </div>
  )

  const renderActiveStep = () => {
    if (activeStep === 'create') return renderCreateStep()
    if (activeStep === 'terminal') return renderTerminalStep()
    return renderSdkStep()
  }

  const renderStepNavigation = (label: string, steps: OnboardingStep[]) => (
    <div className="grid gap-2">
      <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <ol className="grid grid-cols-2 gap-2 md:flex md:flex-col">
        {steps.map((step) => {
          const status = getStepStatus(step.id, activeStep, progress, hasBoxes)
          const isActive = activeStep === step.id
          const isLocked = status === 'locked'
          const isSetupComplete = step.phase === 'setup' && status === 'complete'
          const isNextStepVisited = step.phase === 'next' && status === 'visited'

          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setActiveStep(step.id)}
                className={cn(
                  'flex h-full w-full items-start gap-2 rounded-md border p-2.5 text-left transition-colors md:gap-3 md:p-3',
                  isActive
                    ? 'border-foreground bg-accent shadow-sm'
                    : 'border-transparent hover:border-border hover:bg-muted/50',
                  isLocked && 'cursor-not-allowed opacity-55 hover:border-transparent hover:bg-transparent',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold',
                    isSetupComplete && 'border-success bg-success text-background',
                    isNextStepVisited && 'border-muted-foreground/40 bg-muted text-muted-foreground',
                    isActive && status !== 'complete' && status !== 'visited' && 'border-foreground text-foreground',
                  )}
                >
                  {isSetupComplete ? (
                    <CheckCircle2 className="size-4" />
                  ) : step.number ? (
                    step.number
                  ) : (
                    <step.Icon className="size-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold leading-5">{step.title}</span>
                  </span>
                  <span className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block md:block">
                    {step.description}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] w-[calc(100vw-0.5rem)] max-w-[980px] flex-col gap-0 overflow-hidden rounded-md p-0 duration-300 data-[state=closed]:duration-200 sm:h-[min(820px,calc(100vh-1rem))] sm:max-h-[calc(100vh-1rem)] sm:max-w-[980px] sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-11 sm:px-6 sm:py-5 sm:pr-14">
          <div className="min-w-0">
            <Badge variant="secondary">
              {coreProgress.completed} of {coreProgress.total} setup tasks
            </Badge>
            <DialogTitle className="mt-3 text-2xl">Get Started</DialogTitle>
            <DialogDescription className="mt-2 max-w-2xl">
              Create a Box and run one command. SDK setup stays available as an optional next step.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-1">
          <aside className="border-b border-border bg-muted/15 p-3 md:border-b-0 md:border-r md:p-4">
            <div className="grid gap-4">
              {renderStepNavigation('Setup', setupSteps)}
              {renderStepNavigation('Next steps', nextSteps)}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                <activeStepConfig.Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{activeStepTitle}</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{activeStepConfig.description}</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{renderActiveStep()}</div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Later
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={goToPreviousStep} disabled={activeStepIndex === 0}>
                  Back
                </Button>
                {activeStepIndex < stepOrder.length - 1 && (
                  <Button
                    variant={canFinishGuide ? 'outline' : 'default'}
                    onClick={goToNextStep}
                    disabled={isNextStepLocked}
                  >
                    {nextButtonLabel}
                  </Button>
                )}
                {canFinishGuide && <Button onClick={() => onOpenChange(false)}>Finish setup</Button>}
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
