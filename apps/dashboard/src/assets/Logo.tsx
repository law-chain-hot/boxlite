/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import boxliteLogoBlack from './boxlite-black.png'
import boxliteLogoLight from './boxlite-light.png'

type LogoProps = {
  className?: string
  decorative?: boolean
}

export function Logo({ className = 'h-7 w-7', decorative = false }: LogoProps) {
  const imageProps = decorative ? { alt: '', 'aria-hidden': true } : { alt: 'BoxLite' }

  return (
    <span className={`inline-flex items-center justify-start overflow-hidden ${className}`}>
      <img {...imageProps} src={boxliteLogoBlack} className="block h-full w-auto max-w-none dark:hidden" />
      <img {...imageProps} src={boxliteLogoLight} className="hidden h-full w-auto max-w-none dark:block" />
    </span>
  )
}

export function LogoText() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
      <Logo className="h-5 w-5" decorative />
      <span>BoxLite</span>
    </span>
  )
}
