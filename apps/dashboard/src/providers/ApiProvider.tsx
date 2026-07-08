/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiContext } from '@/contexts/ApiContext'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import LoadingFallback from '@/components/LoadingFallback'
import { Button } from '@/components/ui/button'
import { ApiClient } from '@/api/apiClient'
import { useLocation } from 'react-router-dom'
import { useConfig } from '@/hooks/useConfig'

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading, signinRedirect, removeUser } = useAuth()
  const config = useConfig()
  const location = useLocation()

  const apiRef = useRef<ApiClient | null>(null)
  const [isApiReady, setIsApiReady] = useState(false)
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false)
  const [apiReadyTimedOut, setApiReadyTimedOut] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setAuthLoadingTimedOut(false)
      return
    }

    const timer = setTimeout(() => setAuthLoadingTimedOut(true), 6_000)
    return () => clearTimeout(timer)
  }, [isLoading])

  useEffect(() => {
    if (isLoading || isApiReady) {
      setApiReadyTimedOut(false)
      return
    }

    const timer = setTimeout(() => setApiReadyTimedOut(true), 6_000)
    return () => clearTimeout(timer)
  }, [isLoading, isApiReady])

  // Initialize API client as soon as user is available
  useEffect(() => {
    if (user) {
      if (!apiRef.current) {
        // On a 401 the stored token is invalid (expired, or signed by a rotated
        // Dex key). Clearing the user flips isAuthenticated false, which the
        // effect below turns into a redirect to a fresh login (preserving
        // returnTo). Return the removeUser promise (don't void it) so the 401
        // handler can tell a started recovery (suspend) from a failed one
        // (surface an error). The redirect stays owned by the effect below to
        // avoid a double-redirect.
        apiRef.current = new ApiClient(config, user.access_token, async () => {
          await removeUser()
          await signinRedirect({
            state: {
              returnTo: location.pathname + location.search,
            },
          })
        })
      } else {
        apiRef.current.setAccessToken(user.access_token)
      }
      setIsApiReady(true)
    } else {
      setIsApiReady(false)
    }
  }, [user, config, removeUser, signinRedirect, location])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void signinRedirect({
        state: {
          returnTo: location.pathname + location.search,
        },
      })
    }
  }, [isLoading, isAuthenticated, signinRedirect, location])

  if ((isLoading && authLoadingTimedOut) || (!isLoading && !isApiReady && apiReadyTimedOut)) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-6 text-center font-mono text-foreground">
        <div className="text-[17px] uppercase tracking-[2.5px] text-muted-foreground">sign-in handshake stalled</div>
        <p className="max-w-md text-[13px] leading-6 text-muted-foreground">
          The local sign-in state did not finish loading. Restart the OIDC redirect to continue.
        </p>
        <Button
          className="font-mono"
          onClick={() => {
            void removeUser().finally(() =>
              signinRedirect({
                state: {
                  returnTo: location.pathname + location.search,
                },
              }),
            )
          }}
        >
          Retry sign-in
        </Button>
      </div>
    )
  }

  if (isLoading || !isApiReady) {
    return <LoadingFallback />
  }

  return <ApiContext.Provider value={apiRef.current}>{children}</ApiContext.Provider>
}
