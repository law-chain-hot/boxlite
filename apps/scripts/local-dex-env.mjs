#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const appsRoot = path.resolve(scriptsRoot, '..')
const repoRoot = path.resolve(appsRoot, '..')

const defaultConfig = {
  dashboardUrl: process.env.BOXLITE_E2E_BASE_URL || 'http://localhost:3000',
  apiUrl: process.env.BOXLITE_E2E_API_URL || 'http://localhost:3001/api',
  dexIssuer: process.env.BOXLITE_E2E_DEX_ISSUER || 'http://localhost:5556',
  dexClientId: process.env.BOXLITE_E2E_DEX_CLIENT_ID || 'boxlite',
  dexAudience: process.env.BOXLITE_E2E_DEX_AUDIENCE || 'boxlite',
  loginEmail: process.env.BOXLITE_E2E_LOGIN_EMAIL || 'admin@boxlite.dev',
  loginPassword: process.env.BOXLITE_E2E_LOGIN_PASSWORD || 'password',
  postgresContainer: 'boxlite-local-postgres',
  redisContainer: 'boxlite-local-redis',
  dexContainer: 'boxlite-local-dex',
}

export async function runLocalDexEnvironment({ mode, command = [] }) {
  ensureDocker()
  ensureDexConfig(defaultConfig)

  ensurePostgres(defaultConfig)
  ensureRedis(defaultConfig)
  ensureDex(defaultConfig)

  await waitForTcp('localhost', 5432, 'Postgres')
  await waitForTcp('localhost', 6379, 'Redis')
  await waitForHttp(`${defaultConfig.dexIssuer}/.well-known/openid-configuration`, 'Dex')

  const appsProcess = startApps(defaultConfig)
  bindShutdown(appsProcess)

  try {
    await waitForHttp(`${defaultConfig.apiUrl}/config`, 'BoxLite API', appsProcess)
    await waitForHttp(defaultConfig.dashboardUrl, 'BoxLite dashboard', appsProcess)
    printReady(mode, command, defaultConfig)

    if (command.length > 0) {
      const exitCode = await runE2eCommand(command, defaultConfig)
      shutdown(appsProcess)
      process.exit(exitCode)
    }

    process.exitCode = await waitForExit(appsProcess)
  } catch (error) {
    shutdown(appsProcess)
    throw error
  }
}

export function parseCommand(argv) {
  const separatorIndex = argv.indexOf('--')
  if (separatorIndex === -1) {
    const envCommand = process.env.BOXLITE_E2E_COMMAND
    return envCommand ? shellCommand(envCommand) : []
  }
  return argv.slice(separatorIndex + 1)
}

function shellCommand(command) {
  const shell = process.env.SHELL || '/bin/sh'
  return [shell, '-lc', command]
}

function ensureDocker() {
  const result = spawnSync('docker', ['info'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.status !== 0) {
    throw new Error(
      [
        'Docker is required for the local Dex E2E environment.',
        'Start Docker Desktop, then run this command again.',
        trimOutput(result.stderr || result.stdout),
      ]
        .filter(Boolean)
        .join(os.EOL),
    )
  }
}

function ensureDexConfig(config) {
  const sourcePath = path.join(appsRoot, 'dex', 'config.yaml')
  const targetDir = path.join(repoRoot, '.boxlite-home', 'dex')
  const targetPath = path.join(targetDir, 'config.local.yaml')

  fs.mkdirSync(targetDir, { recursive: true })

  const configText = fs
    .readFileSync(sourcePath, 'utf8')
    .replaceAll('${DEX_ISSUER}', config.dexIssuer)
    .replaceAll('${REDIRECT_URI}', config.dashboardUrl)

  fs.writeFileSync(targetPath, configText)
}

function ensurePostgres(config) {
  ensureContainer({
    name: config.postgresContainer,
    image: 'postgres:16-alpine',
    args: [
      '-p',
      '5432:5432',
      '-v',
      'boxlite-local-postgres:/var/lib/postgresql/data',
      '-e',
      'POSTGRES_USER=postgres',
      '-e',
      'POSTGRES_PASSWORD=postgres',
      '-e',
      'POSTGRES_DB=boxlite',
    ],
  })
}

function ensureRedis(config) {
  ensureContainer({
    name: config.redisContainer,
    image: 'redis:7-alpine',
    args: ['-p', '6379:6379'],
  })
}

function ensureDex(config) {
  const configPath = path.join(repoRoot, '.boxlite-home', 'dex', 'config.local.yaml')

  ensureContainer({
    name: config.dexContainer,
    image: 'ghcr.io/dexidp/dex:v2.41.1',
    args: ['-p', '5556:5556', '-v', `${configPath}:/etc/dex/config.yaml:ro`, '-v', 'boxlite-local-dex:/var/dex'],
    command: ['dex', 'serve', '/etc/dex/config.yaml'],
  })
}

function ensureContainer({ name, image, args, command = [] }) {
  if (isContainerRunning(name)) {
    return
  }

  if (containerExists(name)) {
    docker(['rm', name], { stdio: 'ignore' })
  }

  docker(['run', '-d', '--name', name, ...args, image, ...command], { stdio: 'inherit' })
}

function containerExists(name) {
  return docker(['ps', '-a', '--format', '{{.Names}}']).split(/\r?\n/).includes(name)
}

function isContainerRunning(name) {
  return docker(['ps', '--format', '{{.Names}}']).split(/\r?\n/).includes(name)
}

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  })

  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed${result.stderr ? `:${os.EOL}${trimOutput(result.stderr)}` : ''}`)
  }

  return result.stdout?.trim() || ''
}

function startApps(config) {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    ENVIRONMENT: 'development',
    PORT: '3001',
    APP_URL: config.dashboardUrl,
    DASHBOARD_URL: config.dashboardUrl,
    DASHBOARD_BASE_API_URL: '',
    SKIP_CONNECTIONS: 'false',
    DISABLE_CRON_JOBS: 'true',
    NOTIFICATION_GATEWAY_DISABLED: 'true',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_DATABASE: 'boxlite',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    OIDC_CLIENT_ID: config.dexClientId,
    OIDC_ISSUER_BASE_URL: config.dexIssuer,
    OIDC_AUDIENCE: config.dexAudience,
    BOXLITE_E2E_BASE_URL: config.dashboardUrl,
    BOXLITE_E2E_API_URL: config.apiUrl,
    BOXLITE_E2E_DEX_ISSUER: config.dexIssuer,
    BOXLITE_E2E_LOGIN_EMAIL: config.loginEmail,
    BOXLITE_E2E_LOGIN_PASSWORD: config.loginPassword,
  }

  // Keep dashboard on the Vite /api proxy path; setting VITE_BASE_API_URL here
  // would silently switch the browser away from the local API/Dex flow.
  delete env.VITE_BASE_API_URL
  delete env.VITE_API_URL

  return spawn('npm', ['--prefix', 'apps', 'run', 'serve-slim'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  })
}

async function runE2eCommand(command, config) {
  const [program, ...args] = command
  const child = spawn(program, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      BOXLITE_E2E_BASE_URL: config.dashboardUrl,
      BOXLITE_E2E_API_URL: config.apiUrl,
      BOXLITE_E2E_DEX_ISSUER: config.dexIssuer,
      BOXLITE_E2E_LOGIN_EMAIL: config.loginEmail,
      BOXLITE_E2E_LOGIN_PASSWORD: config.loginPassword,
    },
    stdio: 'inherit',
  })

  return await waitForExit(child)
}

async function waitForHttp(url, label, processToWatch) {
  const startedAt = Date.now()
  const timeoutMs = 120_000
  let lastError

  while (Date.now() - startedAt < timeoutMs) {
    throwIfExited(processToWatch, label)

    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500) {
        return
      }
      lastError = new Error(`${url} returned ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await delay(1_000)
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError?.message || 'timed out'}`)
}

async function waitForTcp(host, port, label) {
  const startedAt = Date.now()
  const timeoutMs = 60_000
  let lastError

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port })
        socket.once('connect', () => {
          socket.end()
          resolve()
        })
        socket.once('error', reject)
        socket.setTimeout(1_000, () => {
          socket.destroy(new Error('timed out'))
        })
      })
      return
    } catch (error) {
      lastError = error
      await delay(500)
    }
  }

  throw new Error(`${label} did not open ${host}:${port}: ${lastError?.message || 'timed out'}`)
}

function printReady(mode, command, config) {
  console.log('')
  console.log(`[local-dex] ${mode} environment is ready`)
  console.log(`[local-dex] Dashboard: ${config.dashboardUrl}`)
  console.log(`[local-dex] API: ${config.apiUrl}`)
  console.log(`[local-dex] Dex issuer: ${config.dexIssuer}`)
  console.log(`[local-dex] Test login: ${config.loginEmail} / ${config.loginPassword}`)
  console.log('')

  if (mode === 'e2e') {
    console.log('[local-dex] E2E auth rule: tests must log in through Dex when redirected.')
    console.log('[local-dex] Do not rely on browser cache; each browser profile has its own session.')
    if (command.length === 0) {
      console.log('[local-dex] No test command was provided, so the local E2E environment will stay running.')
      console.log('[local-dex] To run a one-shot test command: npm run e2e:local -- -- <command>')
      console.log('')
    }
  }
}

function throwIfExited(child, label) {
  if (!child) {
    return
  }
  if (child.exitCode !== null) {
    throw new Error(`${label} startup failed because apps exited with code ${child.exitCode}`)
  }
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      if (signal) {
        resolve(1)
        return
      }
      resolve(code ?? 0)
    })
  })
}

function shutdown(child) {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
  }
}

function bindShutdown(child) {
  const stop = (signal) => {
    shutdown(child)
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }

  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

function trimOutput(output) {
  return output.trim().split(/\r?\n/).slice(-8).join(os.EOL)
}
