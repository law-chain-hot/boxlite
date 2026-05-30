/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  Command,
  CommandCheckboxItem,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandInputButton,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Environment } from '@/hooks/queries/useEnvironmentsQuery'
import { getEnvironmentDisplayName } from '@/lib/environment-display'
import { Loader2, X } from 'lucide-react'
import { useState } from 'react'

interface SnapshotFilterProps {
  value: string[]
  onFilterChange: (value: string[] | undefined) => void
  environments: Environment[]
  isLoading: boolean
}

export function SnapshotFilterIndicator({ value, onFilterChange, environments, isLoading }: SnapshotFilterProps) {
  return (
    <div className="flex items-center h-6 gap-0.5 rounded-sm border border-border bg-muted/80 hover:bg-muted/50 text-sm">
      <Popover>
        <PopoverTrigger className="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground px-2">
          Base image: <span className="text-primary font-medium">{value.length} selected</span>
        </PopoverTrigger>

        <PopoverContent className="p-0 w-[240px]" align="start">
          <SnapshotFilter
            value={value}
            onFilterChange={onFilterChange}
            environments={environments}
            isLoading={isLoading}
          />
        </PopoverContent>
      </Popover>

      <button className="h-6 w-5 p-0 border-0 hover:text-muted-foreground" onClick={() => onFilterChange(undefined)}>
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function SnapshotFilter({ value, onFilterChange, environments, isLoading }: SnapshotFilterProps) {
  const [searchValue, setSearchValue] = useState('')

  const filteredEnvironments = environments.filter((environment) => {
    const search = searchValue.trim().toLowerCase()
    if (!search) return true

    return [environment.displayName, environment.name, environment.imageName, environment.description]
      .filter(Boolean)
      .some((field) => field?.toLowerCase().includes(search))
  })

  const handleSelect = (environmentName: string) => {
    const newValue = value.includes(environmentName)
      ? value.filter((name) => name !== environmentName)
      : [...value, environmentName]
    onFilterChange(newValue.length > 0 ? newValue : undefined)
  }

  const handleSearchChange = (search: string | number) => {
    setSearchValue(String(search))
  }

  return (
    <Command>
      <CommandInput placeholder="Search..." className="" value={searchValue} onValueChange={handleSearchChange}>
        <CommandInputButton
          onClick={() => {
            onFilterChange(undefined)
            setSearchValue('')
          }}
        >
          Clear
        </CommandInputButton>
      </CommandInput>
      <CommandList>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Loading base images...</span>
          </div>
        ) : (
          <>
            <CommandEmpty>No base images found.</CommandEmpty>
            <CommandGroup>
              {filteredEnvironments.map((environment) => (
                <CommandCheckboxItem
                  key={environment.id}
                  onSelect={() => handleSelect(environment.name)}
                  value={environment.name}
                  className="cursor-pointer items-start"
                  checked={value.includes(environment.name)}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="truncate text-sm">
                      {environment.displayName || getEnvironmentDisplayName(environment.imageName ?? environment.name)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {environment.imageName ?? environment.name}
                    </div>
                  </div>
                </CommandCheckboxItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  )
}
