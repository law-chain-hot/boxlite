/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { RoutePath } from '@/enums/RoutePath'
import { queryKeys } from '@/hooks/queries/queryKeys'
import { BoxliteConfiguration } from '@boxlite-ai/api-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { WebStorageStateStore } from 'oidc-client-ts'
import { ReactNode, useMemo } from 'react'
import { AuthProvider, AuthProviderProps } from 'react-oidc-context'
import { ConfigContext } from '../contexts/ConfigContext'
import { MockAuthProvider } from '../mocks/MockAuthProvider'

const apiUrl = (import.meta.env.VITE_BASE_API_URL ?? window.location.origin) + '/api'
const isMocking = import.meta.env.VITE_ENABLE_MOCKING === 'true'
const isLocalDashboard = ['localhost', '127.0.0.1'].includes(window.location.hostname)

type Props = {
  children: ReactNode
}

export function ConfigProvider(props: Props) {
  if (isLocalDashboard) {
    return <LocalConfigProvider>{props.children}</LocalConfigProvider>
  }

  return <RemoteConfigProvider>{props.children}</RemoteConfigProvider>
}

function LocalConfigProvider(props: Props) {
  const config = useMemo(() => localFallbackConfig(), [])
  return <ConfigProviderInner config={config}>{props.children}</ConfigProviderInner>
}

function RemoteConfigProvider(props: Props) {
  const { data: config } = useSuspenseQuery({
    queryKey: queryKeys.config.all,
    queryFn: async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3_000)
      try {
        const res = await fetch(`${apiUrl}/config`, { signal: controller.signal })
        if (!res.ok) {
          throw res
        }
        return res.json() as Promise<BoxliteConfiguration>
      } finally {
        clearTimeout(timeout)
      }
    },
    // App config (OIDC issuer, feature flags, domains) is fixed for a deploy.
    // Never refetch it on navigation — it gates AuthProvider construction.
    staleTime: Infinity,
    gcTime: Infinity,
  })

  return <ConfigProviderInner config={config}>{props.children}</ConfigProviderInner>
}

function ConfigProviderInner({ children, config }: Props & { config: BoxliteConfiguration }) {
  const oidcConfig: AuthProviderProps = useMemo(() => {
    return {
      authority: config.oidc.issuer,
      client_id: config.oidc.clientId,
      extraQueryParams: {
        audience: config.oidc.audience,
      },
      scope: 'openid profile email',
      redirect_uri: window.location.origin,
      staleStateAgeInSeconds: 60,
      accessTokenExpiringNotificationTimeInSeconds: 290,
      // Persist the signed-in user (with tokens) in sessionStorage so a page
      // reload restores the session instead of re-running the OIDC redirect +
      // token exchange (~1.4s on the critical path, and a full Auth0 round-trip
      // on a hard reload). Was InMemoryWebStorage in prod, which is wiped on
      // every load. sessionStorage (not localStorage) keeps the XSS exposure to
      // the tab lifetime; a 401 still clears the user via ApiClient's handler,
      // so a stale/revoked token can't get stuck.
      userStore: new WebStorageStateStore({ store: isLocalDashboard ? window.localStorage : window.sessionStorage }),
      onSigninCallback: (user) => {
        const state = user?.state as { returnTo?: string } | undefined
        const targetUrl = state?.returnTo || RoutePath.DASHBOARD
        window.history.replaceState({}, '', targetUrl)
        window.dispatchEvent(new PopStateEvent('popstate'))
      },
      post_logout_redirect_uri: window.location.origin,
      // For IdPs (e.g. Dex) that don't advertise end_session_endpoint via discovery,
      // the API exposes a compatible endpoint and reports it here.
      ...(config.oidc.endSessionEndpoint && {
        metadataSeed: { end_session_endpoint: config.oidc.endSessionEndpoint },
      }),
    }
  }, [config])

  return (
    <ConfigContext.Provider value={{ ...config, apiUrl }}>
      {isMocking ? (
        <MockAuthProvider>{children}</MockAuthProvider>
      ) : (
        <AuthProvider {...oidcConfig}>{children}</AuthProvider>
      )}
    </ConfigContext.Provider>
  )
}

function localFallbackConfig(): BoxliteConfiguration {
  return {
    version: '0.0.0-dev',
    oidc: {
      issuer: 'http://localhost:25556/dex',
      clientId: 'boxlite',
      audience: 'boxlite',
    },
    linkedAccountsEnabled: false,
    announcements: {},
    proxyTemplateUrl: 'http://{{PORT}}-{{boxId}}.localhost:28080',
    proxyToolboxUrl: 'http://localhost:28080/toolbox',
    dashboardUrl: window.location.origin,
    maintananceMode: false,
    environment: 'local',
    rateLimit: {
      authenticated: {},
      boxCreate: {},
      boxLifecycle: {},
    },
  } as BoxliteConfiguration
}
