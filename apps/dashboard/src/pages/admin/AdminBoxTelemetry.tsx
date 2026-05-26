/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { RoutePath } from '@/enums/RoutePath'
import React from 'react'
import { Navigate } from 'react-router-dom'

const AdminBoxTelemetry: React.FC = () => {
  return <Navigate to={`${RoutePath.ADMIN}?view=platformTelemetry`} replace />
}

export default AdminBoxTelemetry
