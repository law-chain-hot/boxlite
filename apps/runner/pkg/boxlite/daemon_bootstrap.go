// Copyright 2026 BoxLite AI
// SPDX-License-Identifier: AGPL-3.0

package boxlite

import (
	"context"
	"fmt"
	"net/http"
	"time"

	sdk "github.com/boxlite-ai/boxlite/sdks/go"
	runnerdaemon "github.com/boxlite-ai/runner/pkg/daemon"
)

const (
	sandboxDaemonBinaryName   = "daemon-amd64"
	sandboxDaemonBinaryPath   = "/usr/local/bin/boxlite-daemon"
	sandboxDaemonBootstrapLog = "/tmp/boxlite-daemon-bootstrap.log"
)

type daemonBootstrapBox interface {
	CopyInto(ctx context.Context, hostSrc, guestDst string) error
	Exec(ctx context.Context, name string, arg ...string) (*sdk.ExecResult, error)
}

func (c *Client) startSandboxDaemon(ctx context.Context, bx daemonBootstrapBox, sandboxID string, toolboxHostPort int) error {
	daemonPath, err := runnerdaemon.WriteStaticBinary(sandboxDaemonBinaryName)
	if err != nil {
		return fmt.Errorf("write sandbox daemon binary: %w", err)
	}

	if err := installAndLaunchSandboxDaemon(ctx, bx, daemonPath); err != nil {
		return err
	}

	waitCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := waitForSandboxDaemonReady(waitCtx, toolboxHostPort); err != nil {
		return fmt.Errorf("sandbox daemon did not become ready for %s: %w", sandboxID, err)
	}

	return nil
}

func installAndLaunchSandboxDaemon(ctx context.Context, bx daemonBootstrapBox, daemonPath string) error {
	if err := bx.CopyInto(ctx, daemonPath, sandboxDaemonBinaryPath); err != nil {
		return fmt.Errorf("copy sandbox daemon into box: %w", err)
	}

	result, err := bx.Exec(ctx, "sh", "-lc", sandboxDaemonLaunchCommand())
	if err != nil {
		return fmt.Errorf("launch sandbox daemon: %w", err)
	}
	if result == nil {
		return fmt.Errorf("launch sandbox daemon: missing execution result")
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("launch sandbox daemon failed with exit code %d: %s", result.ExitCode, result.Stderr)
	}

	return nil
}

func sandboxDaemonLaunchCommand() string {
	return fmt.Sprintf(
		"chmod +x %[1]s && if command -v nohup >/dev/null 2>&1; then nohup %[1]s >>%[2]s 2>&1 < /dev/null & else %[1]s >>%[2]s 2>&1 < /dev/null & fi",
		sandboxDaemonBinaryPath,
		sandboxDaemonBootstrapLog,
	)
}

func waitForSandboxDaemonReady(ctx context.Context, hostPort int) error {
	if hostPort <= 0 || hostPort > 65535 {
		return fmt.Errorf("invalid toolbox host port %d", hostPort)
	}

	client := http.Client{Timeout: 800 * time.Millisecond}
	url := fmt.Sprintf("http://127.0.0.1:%d/version", hostPort)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	var lastErr error
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		res, err := client.Do(req)
		if err == nil {
			_ = res.Body.Close()
			if res.StatusCode >= 200 && res.StatusCode < 500 {
				return nil
			}
			lastErr = fmt.Errorf("GET %s returned HTTP %d", url, res.StatusCode)
		} else {
			lastErr = err
		}

		select {
		case <-ctx.Done():
			if lastErr != nil {
				return fmt.Errorf("%w; last readiness error: %v", ctx.Err(), lastErr)
			}
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
