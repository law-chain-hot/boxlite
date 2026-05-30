/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from 'react-oidc-context'
import LoadingFallback from '@/components/LoadingFallback'
import { RoutePath } from '@/enums/RoutePath'
import { Logo } from '@/assets/Logo'
import { Button } from '@/components/ui/button'
import { ArrowRight, Boxes, ShieldCheck, TerminalSquare } from 'lucide-react'

const LandingPage: React.FC = () => {
  const { signinRedirect, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const returnTo = location.pathname + location.search

  if (isLoading) {
    return <LoadingFallback />
  }

  if (isAuthenticated) {
    return <Navigate to={`${RoutePath.DASHBOARD}${location.search}`} replace />
  }

  const handleSignIn = () => {
    void signinRedirect({
      state: {
        returnTo,
      },
    })
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="relative flex min-h-[56svh] flex-col overflow-hidden px-6 py-6 sm:px-10 lg:min-h-svh">
          <div className="absolute inset-0 bg-muted/25" />
          <Logo
            className="absolute -bottom-16 -right-20 h-80 w-80 opacity-[0.04] sm:h-[28rem] sm:w-[28rem]"
            decorative
          />

          <div className="relative z-10 flex items-center gap-3">
            <Logo className="h-8 w-8" decorative />
            <span className="text-lg font-semibold tracking-tight">BoxLite</span>
          </div>

          <div className="relative z-10 mt-auto max-w-3xl pb-8 pt-24 sm:pb-12">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Cloud Sandbox</p>
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Start an isolated Linux box in seconds.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Create a Box, open a terminal, and consume it from the SDK without managing internal templates.
            </p>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                { icon: <Boxes className="size-4" />, label: 'Shared base images' },
                { icon: <TerminalSquare className="size-4" />, label: 'Terminal ready' },
                { icon: <ShieldCheck className="size-4" />, label: 'Isolated runtime' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded-md border border-border/70 bg-background/55 px-3 py-2 text-sm backdrop-blur"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="flex items-center justify-center border-t border-border bg-background px-6 py-10 lg:border-l lg:border-t-0">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <Logo className="mb-4 h-10 w-10" decorative />
              <h2 className="text-2xl font-semibold tracking-tight">Sign in to BoxLite</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use your BoxLite account to manage Boxes, API keys, and onboarding.
              </p>
            </div>

            <Button size="lg" className="w-full justify-between" onClick={handleSignIn}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </aside>
      </div>
    </main>
  )
}

export default LandingPage
