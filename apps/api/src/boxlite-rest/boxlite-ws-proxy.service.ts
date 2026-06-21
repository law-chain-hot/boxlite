/*
 * SPDX-License-Identifier: AGPL-3.0
 * Copyright (c) 2025 BoxLite AI
 */

import { Injectable, Logger } from '@nestjs/common'
import type { IncomingMessage } from 'http'
import type { Socket } from 'net'
import type { Request } from 'express'
import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware'
import { ApiKeyService } from '../api-key/api-key.service'
import { JwtStrategy } from '../auth/jwt.strategy'
import { OrganizationUserService } from '../organization/services/organization-user.service'
import { BoxService } from '../box/services/box.service'
import { RunnerService } from '../box/services/runner.service'
import type { Runner } from '../box/entities/runner.entity'
import { CustomHeaders } from '../common/constants/header.constants'
import { SystemRole } from '../user/enums/system-role.enum'

type RunnerUpgradeRequest = IncomingMessage & {
  __boxliteRunner?: Runner
  __boxliteRunnerBoxId?: string
}

// Matches /api/v1/boxes/<id>/executions/<id>/attach and the legacy
// /api/v1/<tenant>/boxes/<id>/executions/<id>/attach shape with optional query string.
// Capture group 1 is the optional routing prefix, group 2 is the public box id.
const ATTACH_PATH = /^\/api\/v1\/(?:([^/]+)\/)?boxes\/([^/]+)\/executions\/[^/]+\/attach(?:\?.*)?$/

/**
 * Singleton WebSocket proxy for `/attach` upgrades.
 *
 * Express middleware/guards don't run on Node's `upgrade` event, so the
 * NestJS controller `@Get(':boxId/executions/:execId/attach')` route never
 * fires for actual WS upgrade requests — it's HTTP-only and gets bypassed.
 * Main.ts registers `server.on('upgrade', wsProxy.upgrade)` and routes
 * matching paths through this service, which mirrors the API-key half of
 * CombinedAuthGuard inline, resolves the runner, and hands off to a
 * shared `createProxyMiddleware({ ws: true, ... })` instance.
 */
@Injectable()
export class BoxliteWsProxyService {
  private readonly logger = new Logger(BoxliteWsProxyService.name)
  private readonly proxy: RequestHandler

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly jwtStrategy: JwtStrategy | undefined,
    private readonly organizationUserService: OrganizationUserService,
    private readonly boxService: BoxService,
    private readonly runnerService: RunnerService,
  ) {
    this.proxy = createProxyMiddleware({
      ws: true,
      changeOrigin: true,
      // Drop the public `/api/v1/` or `/api/v1/<tenant>/` prefix; runner mounts routes at `/v1/...`.
      pathRewrite: (path: string, req: IncomingMessage) => {
        const runnerBoxId = (req as RunnerUpgradeRequest).__boxliteRunnerBoxId
        if (!runnerBoxId) {
          throw new Error('ws proxy: runner box id not resolved before upgrade — bug in caller')
        }
        return path.replace(/^\/api\/v1\/(?:[^/]+\/)?boxes\/[^/]+/, `/v1/boxes/${runnerBoxId}`)
      },
      // Target is resolved per-upgrade and stashed on the request before
      // delegating into the proxy.
      router: (req: IncomingMessage) => {
        const runner = (req as RunnerUpgradeRequest).__boxliteRunner
        if (!runner) {
          throw new Error('ws proxy: runner not resolved before upgrade — bug in caller')
        }
        return runner.apiUrl || (runner as Runner & { proxyUrl?: string }).proxyUrl || ''
      },
      on: {
        proxyReqWs: (proxyReq: { setHeader: (name: string, value: string) => void }, req: IncomingMessage) => {
          const runner = (req as RunnerUpgradeRequest).__boxliteRunner
          if (runner?.apiKey) {
            proxyReq.setHeader('Authorization', `Bearer ${runner.apiKey}`)
          }
        },
      },
    })
  }

  /** True when the request's URL is an `/attach` WS upgrade we should handle. */
  matchAttachPath(url: string | undefined): { prefix?: string; boxId: string } | null {
    if (!url) return null
    const m = url.match(ATTACH_PATH)
    if (!m) return null
    return m[1] ? { prefix: m[1], boxId: m[2] } : { boxId: m[2] }
  }

  /**
   * Resolve auth + box + runner, then hand the upgrade to the shared
   * proxy middleware. Closes the socket cleanly on any failure.
   */
  async upgrade(req: IncomingMessage, socket: Socket, head: Buffer): Promise<void> {
    const match = this.matchAttachPath(req.url)
    if (!match) {
      socket.destroy()
      return
    }

    const auth = await this.authenticate(req, match.prefix)
    if (!auth) {
      this.respondAndClose(socket, 401, 'Unauthorized')
      return
    }

    try {
      const box = await this.boxService.findOneByIdOrName(match.boxId, auth.organizationId)
      if (!box?.runnerId) {
        this.respondAndClose(socket, 404, 'Not Found')
        return
      }
      // Mirror legacy toolbox path — opening a WS attach is user activity,
      // so the autostop cron does not reap a session that's still connected.
      // Best-effort: do not fail the upgrade if this errors.
      this.boxService
        .updateLastActivityAt(box.id, new Date())
        .catch((err) => this.logger.warn(`updateLastActivityAt failed for ${box.id}: ${err}`))
      const runner = await this.runnerService.findOne(box.runnerId)
      if (!runner) {
        this.respondAndClose(socket, 404, 'Not Found')
        return
      }
      ;(req as RunnerUpgradeRequest).__boxliteRunner = runner
      ;(req as RunnerUpgradeRequest).__boxliteRunnerBoxId = box.id
      ;(
        this.proxy as unknown as {
          upgrade: (req: IncomingMessage, socket: Socket, head: Buffer) => void
        }
      ).upgrade(req, socket, head)
    } catch (err) {
      this.logger.warn(`upgrade failed for ${req.url}: ${(err as Error).message}`)
      this.respondAndClose(socket, 404, 'Not Found')
    }
  }

  /**
   * Inline authentication for WS upgrades. HTTP controllers get
   * CombinedAuthGuard + OrganizationResourceActionGuard automatically, but
   * raw `upgrade` requests bypass Express/Nest middleware. Keep this method
   * behaviorally aligned with that HTTP path:
   *
   * - API keys authenticate to their key's organization.
   * - JWT/OIDC access tokens authenticate to the URL routing prefix (or the
   *   organization header) and must still belong to that organization.
   *
   * Unlike the HTTP path, this does not consult the Redis cache used by
   * ApiKeyStrategy / OrganizationAccessGuard. Upgrade frequency is low; if
   * upgrade latency becomes a concern, add caching as a follow-up.
   */
  private async authenticate(req: IncomingMessage, prefix?: string): Promise<{ organizationId: string } | null> {
    const header = req.headers['authorization']
    const headerValue = Array.isArray(header) ? header[0] : header
    if (!headerValue || !/^bearer\s+/i.test(headerValue)) return null
    const token = headerValue.replace(/^bearer\s+/i, '').trim()
    if (!token) return null

    const apiKeyAuth = await this.authenticateApiKey(token, prefix)
    if (apiKeyAuth) return apiKeyAuth

    return this.authenticateJwt(req, token, prefix)
  }

  private async authenticateApiKey(token: string, prefix?: string): Promise<{ organizationId: string } | null> {
    try {
      const apiKey = await this.apiKeyService.getApiKeyByValue(token)
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null

      const requestedOrganizationId = this.resolveRequestedOrganizationId(prefix, apiKey.organizationId)
      if (requestedOrganizationId && requestedOrganizationId !== apiKey.organizationId) return null

      const membership = await this.organizationUserService.findOne(apiKey.organizationId, apiKey.userId)
      if (!membership) return null

      return { organizationId: apiKey.organizationId }
    } catch {
      return null
    }
  }

  private async authenticateJwt(
    req: IncomingMessage,
    token: string,
    prefix?: string,
  ): Promise<{ organizationId: string } | null> {
    try {
      if (!this.jwtStrategy) return null

      const organizationId = this.resolveRequestedOrganizationId(
        prefix,
        this.headerValue(req, CustomHeaders.ORGANIZATION_ID.name),
      )
      if (!organizationId) return null

      const payload = await this.jwtStrategy.verifyToken(token)
      const request = {
        get: (name: string) =>
          name.toLowerCase() === CustomHeaders.ORGANIZATION_ID.name.toLowerCase() ? organizationId : undefined,
      } as unknown as Request
      const authContext = await this.jwtStrategy.validate(request, payload)

      if (authContext.role === SystemRole.ADMIN) {
        return { organizationId }
      }

      const membership = await this.organizationUserService.findOne(organizationId, authContext.userId)
      if (!membership) return null

      return { organizationId }
    } catch {
      return null
    }
  }

  private resolveRequestedOrganizationId(prefix: string | undefined, fallback: string | undefined): string | undefined {
    return prefix === 'default' ? fallback : prefix || fallback
  }

  private headerValue(req: IncomingMessage, name: string): string | undefined {
    const value = req.headers[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
  }

  private respondAndClose(socket: Socket, status: number, reason: string): void {
    try {
      socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    } catch {
      // Socket may already be torn down — ignore.
    }
    socket.destroy()
  }
}
