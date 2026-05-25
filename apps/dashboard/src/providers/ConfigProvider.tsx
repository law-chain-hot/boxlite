/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { RoutePath } from '@/enums/RoutePath'
import { queryKeys } from '@/hooks/queries/queryKeys'
import { BoxliteConfiguration } from '@boxlite-ai/api-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { InMemoryWebStorage, WebStorageStateStore } from 'oidc-client-ts'
import { ReactNode, useMemo } from 'react'
import { AuthContext, type AuthContextProps, AuthProvider, AuthProviderProps } from 'react-oidc-context'
import { ConfigContext } from '../contexts/ConfigContext'

const apiUrl = (import.meta.env.VITE_BASE_API_URL ?? window.location.origin) + '/api'

type Props = {
  children: ReactNode
}

export function ConfigProvider(props: Props) {
  const mockAuthEnabled = import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === 'true'
  const { data: config } = useSuspenseQuery({
    queryKey: queryKeys.config.all,
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/config`)
      if (!res.ok) {
        throw res
      }
      return res.json() as Promise<BoxliteConfiguration>
    },
  })

  const oidcConfig: AuthProviderProps = useMemo(() => {
    const isLocalhost = window.location.hostname === 'localhost'
    const stateStore = isLocalhost ? window.sessionStorage : new InMemoryWebStorage()

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
      userStore: new WebStorageStateStore({ store: stateStore }),
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

  const mockAuthContext = useMemo<AuthContextProps>(
    () =>
      ({
        isAuthenticated: true,
        isLoading: false,
        activeNavigator: undefined,
        user: {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          profile: {
            sub: 'mock-admin-user',
            email: 'brian@example.com',
            name: 'Brian Luo',
            picture: '',
          },
        },
        signinRedirect: async () => undefined,
        signinSilent: async () => null,
        signoutRedirect: async () => undefined,
        removeUser: async () => undefined,
      }) as unknown as AuthContextProps,
    [],
  )

  return (
    <ConfigContext.Provider value={{ ...config, apiUrl }}>
      {mockAuthEnabled ? (
        <AuthContext.Provider value={mockAuthContext}>{props.children}</AuthContext.Provider>
      ) : (
        <AuthProvider {...oidcConfig}>{props.children}</AuthProvider>
      )}
    </ConfigContext.Provider>
  )
}
