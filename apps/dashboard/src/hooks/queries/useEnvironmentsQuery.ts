/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { useSelectedOrganization } from '../useSelectedOrganization'
import { queryKeys } from './queryKeys'

export interface Environment {
  id: string
  name: string
  displayName: string
  imageName?: string
  version?: string
  cpu: number
  gpu: number
  mem: number
  disk: number
  regionIds?: string[]
}

export function useEnvironmentsQuery() {
  const { axiosInstance } = useApi()
  const { selectedOrganization } = useSelectedOrganization()

  return useQuery<Environment[]>({
    queryKey: queryKeys.environments.list(selectedOrganization?.id ?? ''),
    queryFn: async () => {
      if (!selectedOrganization) {
        throw new Error('No organization selected')
      }

      const response = await axiosInstance.get<Environment[]>('/environments', {
        headers: {
          'X-BoxLite-Organization-ID': selectedOrganization.id,
        },
      })

      return response.data
    },
    enabled: !!selectedOrganization,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
  })
}
