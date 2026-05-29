/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { LogoText } from '@/assets/Logo'
import { OrganizationPicker } from '@/components/Organizations/OrganizationPicker'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BOXLITE_DOCS_URL, BOXLITE_SLACK_URL } from '@/constants/ExternalLinks'
import { useTheme } from '@/contexts/ThemeContext'
import { RoutePath } from '@/enums/RoutePath'
import { useIsCompactScreen } from '@/hooks/use-mobile'
import { useUserOrganizationInvitations } from '@/hooks/useUserOrganizationInvitations'
import { cn, getMetaKey } from '@/lib/utils'
import { usePylon, usePylonCommands } from '@/vendor/pylon'
import {
  ArrowRightIcon,
  BookOpen,
  Check,
  Container,
  LifeBuoyIcon,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Monitor,
  MoreHorizontal,
  MoonIcon,
  SearchIcon,
  Settings,
  SquareUserRound,
  SunIcon,
} from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import React, { useMemo } from 'react'
import { useAuth } from 'react-oidc-context'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CommandConfig, useCommandPaletteActions, useRegisterCommands } from './CommandPalette'

interface SidebarProps {
  isBannerVisible: boolean
  billingEnabled: boolean
  version: string
}

interface SidebarItem {
  icon: React.ReactElement
  label: string
  path: RoutePath | string
  onClick?: () => void
}

interface SidebarGroup {
  label: string
  items: SidebarItem[]
}

const useNavCommands = (items: { label: string; path: RoutePath | string; onClick?: () => void }[]) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const navCommands: CommandConfig[] = useMemo(
    () =>
      items
        .filter((item) => item.path !== pathname)
        .map((item) => ({
          id: `nav-${item.path}`,
          label: `Go to ${item.label}`,
          icon: <ArrowRightIcon className="w-4 h-4" />,
          onSelect: () => (item.onClick ? item.onClick() : navigate(item.path)),
        })),
    [pathname, navigate, items],
  )

  useRegisterCommands(navCommands, { groupId: 'navigation', groupLabel: 'Navigation', groupOrder: 1 })
}

export function Sidebar({ isBannerVisible }: SidebarProps) {
  const isCompactScreen = useIsCompactScreen()
  const posthog = usePostHog()
  const { theme, setTheme } = useTheme()
  const { user, signoutRedirect } = useAuth()
  const { pathname } = useLocation()
  const { count: organizationInvitationsCount } = useUserOrganizationInvitations()

  const primaryItems = useMemo<SidebarItem[]>(() => {
    return [
      {
        icon: <Container size={16} strokeWidth={1.5} />,
        label: 'Sandboxes',
        path: RoutePath.SANDBOXES,
      },
    ]
  }, [])

  const secondaryGroups: SidebarGroup[] = useMemo(() => [], [])

  const commandItems = useMemo<SidebarItem[]>(
    () => [
      ...primaryItems,
      ...secondaryGroups.flatMap((group) => group.items),
      {
        path: RoutePath.ACCOUNT_SETTINGS,
        label: 'Account Settings',
        icon: <Settings size={16} strokeWidth={1.5} />,
      },
      {
        path: RoutePath.USER_INVITATIONS,
        label: 'Invitations',
        icon: <Mail size={16} strokeWidth={1.5} />,
      },
      {
        path: `${RoutePath.SANDBOXES}?onboarding=1`,
        label: 'Onboarding',
        icon: <ListChecks size={16} strokeWidth={1.5} />,
      },
    ],
    [primaryItems, secondaryGroups],
  )

  const handleSignOut = () => {
    posthog?.reset()
    signoutRedirect()
  }

  const { unreadCount: pylonUnreadCount, toggle: togglePylon, isEnabled: pylonEnabled } = usePylon()
  usePylonCommands()

  const commandPaletteActions = useCommandPaletteActions()
  useNavCommands(commandItems)

  const metaKey = getMetaKey()

  const openCommandPalette = (source: string) => {
    posthog?.capture('command_palette_opened', { source })
    commandPaletteActions.setIsOpen(true)
  }

  const renderMenuItem = (item: SidebarItem) => {
    if (item.onClick) {
      return (
        <DropdownMenuItem key={item.label} onClick={() => item.onClick?.()} className="cursor-pointer">
          {item.icon}
          {item.label}
        </DropdownMenuItem>
      )
    }

    return (
      <DropdownMenuItem key={item.label} asChild className="cursor-pointer">
        <Link to={item.path}>
          {item.icon}
          {item.label}
        </Link>
      </DropdownMenuItem>
    )
  }

  return (
    <header
      className={cn(
        'sticky z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/88',
        isBannerVisible ? 'top-16 md:top-12' : 'top-0',
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-5 2xl:px-0">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            to={RoutePath.SANDBOXES}
            className="shrink-0 text-[1.15rem] font-semibold tracking-tight text-foreground"
          >
            <LogoText />
          </Link>

          {!isCompactScreen && (
            <nav className="flex h-14 items-stretch gap-1">
              {primaryItems.map((item) => {
                const isActive = pathname.startsWith(item.path)

                return item.onClick ? (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => item.onClick?.()}
                    className={cn(
                      'inline-flex items-center border-b px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </button>
                ) : (
                  <Link
                    key={item.label}
                    to={item.path}
                    className={cn(
                      'inline-flex items-center border-b px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!isCompactScreen && (
            <Button
              variant="outline"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => openCommandPalette('dashboard_header')}
            >
              <SearchIcon className="size-4" />
              Search
              <Kbd className="ml-1">{metaKey} K</Kbd>
            </Button>
          )}

          <div className="hidden md:block">
            <OrganizationPicker variant="header" />
          </div>

          <Button variant="ghost" size="icon-sm" asChild>
            <Link to={`${RoutePath.SANDBOXES}?onboarding=1`} aria-label="Open onboarding">
              <ListChecks className="size-4" />
            </Link>
          </Button>

          {!isCompactScreen && secondaryGroups.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="hidden md:inline-flex">
                  <MoreHorizontal className="size-4" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[14rem]">
                {secondaryGroups.map((group, index) => (
                  <React.Fragment key={group.label}>
                    {index > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.items.map(renderMenuItem)}
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'inline-flex min-w-0 px-2',
                  isCompactScreen ? 'justify-center' : 'sm:min-w-[8.5rem] sm:justify-between',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {user?.profile.picture ? (
                    <img
                      src={user.profile.picture}
                      alt={user.profile.name || 'Profile picture'}
                      className="h-4 w-4 rounded-sm"
                    />
                  ) : (
                    <SquareUserRound className="size-4" />
                  )}
                  <span className={cn('truncate', isCompactScreen ? 'hidden' : 'hidden sm:block')}>
                    {user?.profile.name || 'Profile'}
                  </span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[15rem]">
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to={RoutePath.ACCOUNT_SETTINGS}>
                  <Settings className="size-4" />
                  Account Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to={RoutePath.USER_INVITATIONS}>
                  <Mail className="size-4" />
                  Invitations
                  {organizationInvitationsCount > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">{organizationInvitationsCount}</span>
                  )}
                </Link>
              </DropdownMenuItem>
              {pylonEnabled && (
                <DropdownMenuItem className="cursor-pointer" onClick={() => togglePylon()}>
                  <LifeBuoyIcon className="size-4" />
                  Support
                  {pylonUnreadCount > 0 && <span className="ml-auto text-xs text-muted-foreground">new</span>}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <a href={BOXLITE_DOCS_URL} target="_blank" rel="noopener noreferrer">
                  <BookOpen className="size-4" />
                  Docs
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <a href={BOXLITE_SLACK_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" />
                  Discord
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('system')}>
                <Monitor className="size-4" />
                System Theme
                {theme === 'system' && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('light')}>
                <SunIcon className="size-4" />
                Light Mode
                {theme === 'light' && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('dark')}>
                <MoonIcon className="size-4" />
                Dark Mode
                {theme === 'dark' && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={handleSignOut}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isCompactScreen && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <Menu className="size-4" />
                  <span className="sr-only">Open navigation menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[14rem]">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => openCommandPalette('dashboard_mobile_menu')}
                >
                  <SearchIcon className="size-4" />
                  Search
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {primaryItems.map(renderMenuItem)}
                {secondaryGroups.map((group) => (
                  <React.Fragment key={group.label}>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.items.map(renderMenuItem)}
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
