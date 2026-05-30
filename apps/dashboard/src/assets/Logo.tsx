/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import boxliteIconBlack from './boxlite-icon-black.png'
import boxliteIconLight from './boxlite-icon-light.png'

type LogoProps = {
  className?: string
  decorative?: boolean
}

export function Logo({ className = 'h-7 w-7', decorative = false }: LogoProps) {
  const imageProps = decorative ? { alt: '', 'aria-hidden': true } : { alt: 'BoxLite' }

  return (
    <span className="inline-flex items-center justify-center">
      <img {...imageProps} src={boxliteIconBlack} className={`block ${className} object-contain dark:hidden`} />
      <img {...imageProps} src={boxliteIconLight} className={`hidden ${className} object-contain dark:block`} />
    </span>
  )
}

export function LogoText() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
      <Logo className="h-6 w-6" decorative />
      <span className="hidden sm:inline">BoxLite</span>
    </span>
  )
}
