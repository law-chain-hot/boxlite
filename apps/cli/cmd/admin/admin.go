// Copyright 2025 BoxLite AI (originally Daytona Platforms Inc.
// Modified by BoxLite AI, 2025-2026
// SPDX-License-Identifier: AGPL-3.0

package admin

import (
	"github.com/boxlite-ai/boxlite/cli/internal"
	"github.com/spf13/cobra"
)

var AdminCmd = &cobra.Command{
	Use:     "admin",
	Short:   "Admin-only BoxLite commands",
	GroupID: internal.ADMIN_GROUP,
}

func init() {
	AdminCmd.AddCommand(ObservabilityCmd)
}
