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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BOXLITE_DOCS_URL } from '@/constants/ExternalLinks'
import { useApi } from '@/hooks/useApi'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import type { OnboardingProgress } from '@/lib/onboarding-progress'
import {
  CreateApiKeyPermissionsEnum,
  OrganizationRolePermissionsEnum,
  type ApiKeyResponse,
} from '@boxlite-ai/api-client'
import { Check, ClipboardIcon, Code2, KeyRound, Loader2, Plus, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface OnboardingGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProgressChange: (progress: OnboardingProgress) => void
  progress: OnboardingProgress
}

type OnboardingLanguage = 'python' | 'typescript' | 'go' | 'rust'

interface OnboardingLanguageOption {
  value: OnboardingLanguage
  label: string
  iconSrc?: string
  Icon?: LucideIcon
}

const languageOptions: OnboardingLanguageOption[] = [
  { value: 'python', label: 'Python', iconSrc: pythonIcon },
  { value: 'typescript', label: 'TypeScript', iconSrc: typescriptIcon },
  { value: 'go', label: 'Go', iconSrc: goIcon },
  { value: 'rust', label: 'Rust', iconSrc: rustIcon },
]

const codeExamples: Record<
  OnboardingLanguage,
  { install: string; run: string; example: string; codeLanguage: string }
> = {
  typescript: {
    install: 'npm install @boxlite-ai/boxlite tsx',
    run: 'npx tsx index.mts',
    codeLanguage: 'typescript',
    example: `import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { ApiKeyCredential, BoxliteRestOptions, JsBoxlite } from '@boxlite-ai/boxlite'

async function readBoxLiteApiKey() {
  const readline = createInterface({ input, output })
  try {
    return (await readline.question('Paste your BoxLite API key: ')).trim()
  } finally {
    readline.close()
  }
}

const apiKey = await readBoxLiteApiKey()
const rt = JsBoxlite.rest(new BoxliteRestOptions({
  url: 'your-api-url',
  credential: new ApiKeyCredential(apiKey),
}))

const box = await rt.create({ image: 'ubuntu:24.04' }, 'sdk-quickstart')
await box.start()

const exec = await box.exec('echo', ['Hello from BoxLite SDK'])
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
from getpass import getpass
from boxlite import ApiKeyCredential, Boxlite, BoxliteRestOptions, BoxOptions

async def main():
    api_key = getpass("Paste your BoxLite API key: ").strip()
    rt = Boxlite.rest(BoxliteRestOptions(
        url="your-api-url",
        credential=ApiKeyCredential(api_key),
    ))

    box = await rt.create(BoxOptions(image="ubuntu:24.04"), name="sdk-quickstart")
    await box.start()

    execution = await box.exec("echo", args=["Hello from BoxLite SDK"])
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
    "bufio"
    "context"
    "fmt"
    "log"
    "os"
    "strings"

    boxlite "github.com/boxlite-ai/boxlite/sdks/go"
)

func readBoxLiteAPIKey() (string, error) {
    fmt.Print("Paste your BoxLite API key: ")
    value, err := bufio.NewReader(os.Stdin).ReadString('\\n')
    return strings.TrimSpace(value), err
}

func main() {
    ctx := context.Background()
    apiKey, err := readBoxLiteAPIKey()
    if err != nil {
        log.Fatal(err)
    }

    rt, err := boxlite.NewRest(boxlite.BoxliteRestOptions{
        URL:        "your-api-url",
        Credential: boxlite.NewApiKeyCredential(apiKey),
    })
    if err != nil {
        log.Fatal(err)
    }
    defer rt.Close()

    box, err := rt.Create(ctx, "ubuntu:24.04", boxlite.WithName("sdk-quickstart"))
    if err != nil {
        log.Fatal(err)
    }
    if err := box.Start(ctx); err != nil {
        log.Fatal(err)
    }

    result, err := box.Exec(ctx, "echo", "Hello from BoxLite SDK")
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
use std::io::{self, Write};

fn read_boxlite_api_key() -> io::Result<String> {
    print!("Paste your BoxLite API key: ");
    io::stdout().flush()?;

    let mut api_key = String::new();
    io::stdin().read_line(&mut api_key)?;
    Ok(api_key.trim().to_owned())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = read_boxlite_api_key()?;
    let rt = BoxliteRuntime::rest(
        BoxliteRestOptions::new("your-api-url").with_api_key(api_key),
    )?;

    let options = BoxOptions {
        rootfs: RootfsSpec::Image("ubuntu:24.04".into()),
        ..Default::default()
    };
    let box_handle = rt.create(options, Some("sdk-quickstart".into())).await?;
    box_handle.start().await?;

    let exec = box_handle
        .exec(BoxCommand::new("echo").arg("Hello from BoxLite SDK"))
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

function StepCard({
  number,
  title,
  description,
}: {
  number: number
  title: string
  description: string
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{number}</span>
        {title}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

export function OnboardingGuideDialog({
  open,
  onOpenChange,
  onProgressChange,
  progress,
}: OnboardingGuideDialogProps) {
  const { apiKeyApi } = useApi()
  const { apiUrl } = useConfig()
  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()
  const [language, setLanguage] = useState<OnboardingLanguage>('python')
  const [apiKeyName, setApiKeyName] = useState('sdk-onboarding')
  const [createdApiKey, setCreatedApiKey] = useState<ApiKeyResponse | null>(null)
  const [isApiKeyCopied, setIsApiKeyCopied] = useState(false)
  const [isLoadingCreateKey, setIsLoadingCreateKey] = useState(false)
  const canCreateApiKey = authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_SANDBOXES)
  const activeExample = codeExamples[language]
  const renderedExample = useMemo(
    () => activeExample.example.replaceAll('your-api-url', apiUrl),
    [activeExample.example, apiUrl],
  )

  const apiKeyPermissions = useMemo(() => {
    if (!canCreateApiKey) return []

    const permissions: CreateApiKeyPermissionsEnum[] = [CreateApiKeyPermissionsEnum.WRITE_SANDBOXES]
    if (authenticatedUserHasPermission(OrganizationRolePermissionsEnum.DELETE_SANDBOXES)) {
      permissions.push(CreateApiKeyPermissionsEnum.DELETE_SANDBOXES)
    }

    return permissions
  }, [authenticatedUserHasPermission, canCreateApiKey])

  useEffect(() => {
    setCreatedApiKey(null)
    setApiKeyName('sdk-onboarding')
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
            name: apiKeyName.trim() || 'sdk-onboarding',
            permissions: apiKeyPermissions,
          },
          selectedOrganization.id,
        )
      ).data
      setCreatedApiKey(key)
      setApiKeyName('sdk-onboarding')
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
      window.setTimeout(() => setIsApiKeyCopied(false), 2000)
    } catch (error) {
      handleApiError(error, 'Failed to copy API key')
    }
  }

  const markSdkConnected = () => {
    onProgressChange({ sdkConnected: true })
    toast.success('SDK setup marked complete')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-md p-0 duration-300 data-[state=closed]:duration-200 sm:h-[min(800px,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)] sm:w-[min(960px,calc(100vw-2rem))] sm:!max-w-[min(960px,calc(100vw-2rem))] sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-11 sm:px-5 sm:py-4 sm:pr-14">
          <div className="min-w-0">
            <DialogTitle className="text-xl">Connect with the SDK</DialogTitle>
            <DialogDescription className="mt-1.5 max-w-2xl">
              Generate a key, install the SDK, and run a small script that creates a Box from code.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-1 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="border-b border-border bg-muted/15 p-3 md:border-b-0 md:border-r">
            <div className="grid gap-2">
              <StepCard
                number={1}
                title="Create a key"
                description="Copy the one-time key from the dashboard. Do not commit it to source control."
              />
              <StepCard
                number={2}
                title="Install the SDK"
                description="Use the language tab that matches your app."
              />
              <StepCard
                number={3}
                title="Run the script"
                description="Paste the key only when the script asks for it."
              />
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                <Code2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">SDK quickstart</h2>
                  {progress.sdkConnected && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="size-3.5" />
                      Complete
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  The examples read the API key at runtime instead of hardcoding it or loading a local env file.
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid min-w-0 gap-4">
                <div className="grid gap-3 rounded-md border bg-muted/15 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <KeyRound className="size-4 text-muted-foreground" />
                    API key
                  </div>

                  {createdApiKey ? (
                    <div className="grid gap-2">
                      <p className="text-sm text-muted-foreground">
                        This key is visible once. Copy it now, then paste it only when your script prompts for it.
                      </p>
                      <div className="relative">
                        <Textarea
                          readOnly
                          value={createdApiKey.value}
                          rows={4}
                          className="min-h-24 resize-none break-all pr-12 font-mono text-xs leading-5"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Copy API key"
                          className="absolute right-2 top-2"
                          onClick={() => copyToClipboard(createdApiKey.value)}
                        >
                          {isApiKeyCopied ? <Check className="size-4" /> : <ClipboardIcon className="size-4" />}
                        </Button>
                      </div>
                    </div>
                  ) : canCreateApiKey ? (
                    <form
                      className="grid gap-3"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        await handleCreateApiKey()
                      }}
                    >
                      <label htmlFor="onboarding-key-name" className="text-sm font-medium">
                        API key name
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="onboarding-key-name"
                          type="text"
                          value={apiKeyName}
                          onChange={(event) => setApiKeyName(event.target.value)}
                          required
                          placeholder="sdk-onboarding"
                          disabled={isLoadingCreateKey}
                          className="flex-1"
                        />
                        <Button type="submit" disabled={isLoadingCreateKey}>
                          {isLoadingCreateKey ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                          Create API key
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                      API key creation is not available for this user.
                    </div>
                  )}
                </div>

                <div className="grid gap-3 rounded-md border bg-background p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <ShieldCheck className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Secret handling</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Keep the API key outside your source files. These examples prompt at runtime so the key never
                        appears in code or a checked-in env file.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
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

                  <div>
                    <div className="mb-2 text-sm font-medium">Install SDK</div>
                    <CodeBlock code={activeExample.install} language="bash" showCopy />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium">Example</div>
                    <CodeBlock
                      code={renderedExample}
                      language={activeExample.codeLanguage}
                      showCopy
                      codeAreaClassName="max-h-[420px] text-xs"
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
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Later
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {!progress.sdkConnected && <Button onClick={markSdkConnected}>I ran the SDK example</Button>}
                {progress.sdkConnected && <Button onClick={() => onOpenChange(false)}>Finish setup</Button>}
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
