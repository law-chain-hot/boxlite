// Copyright 2026 BoxLite AI
// SPDX-License-Identifier: AGPL-3.0

package boxlite

import (
	"context"
	"errors"
	"strings"
	"testing"

	sdk "github.com/boxlite-ai/boxlite/sdks/go"
)

type fakeDaemonBootstrapBox struct {
	copyHostSrc  string
	copyGuestDst string
	execName     string
	execArgs     []string
	execResult   *sdk.ExecResult
	execErr      error
}

func (f *fakeDaemonBootstrapBox) CopyInto(_ context.Context, hostSrc, guestDst string) error {
	f.copyHostSrc = hostSrc
	f.copyGuestDst = guestDst
	return nil
}

func (f *fakeDaemonBootstrapBox) Exec(_ context.Context, name string, args ...string) (*sdk.ExecResult, error) {
	f.execName = name
	f.execArgs = append([]string(nil), args...)
	if f.execResult != nil || f.execErr != nil {
		return f.execResult, f.execErr
	}
	return &sdk.ExecResult{ExitCode: 0}, nil
}

func TestInstallAndLaunchSandboxDaemonCopiesBinaryAndStartsIt(t *testing.T) {
	box := &fakeDaemonBootstrapBox{}

	if err := installAndLaunchSandboxDaemon(t.Context(), box, "/host/daemon-amd64"); err != nil {
		t.Fatalf("installAndLaunchSandboxDaemon: %v", err)
	}

	if box.copyHostSrc != "/host/daemon-amd64" {
		t.Fatalf("expected daemon binary source /host/daemon-amd64, got %q", box.copyHostSrc)
	}
	if box.copyGuestDst != sandboxDaemonBinaryPath {
		t.Fatalf("expected daemon binary destination %q, got %q", sandboxDaemonBinaryPath, box.copyGuestDst)
	}
	if box.execName != "sh" {
		t.Fatalf("expected daemon launcher to use sh, got %q", box.execName)
	}
	if len(box.execArgs) != 2 || box.execArgs[0] != "-lc" {
		t.Fatalf("expected sh -lc launcher, got %#v", box.execArgs)
	}
	launcher := box.execArgs[1]
	for _, expected := range []string{
		"chmod +x " + sandboxDaemonBinaryPath,
		sandboxDaemonBinaryPath,
		"/tmp/boxlite-daemon-bootstrap.log",
	} {
		if !strings.Contains(launcher, expected) {
			t.Fatalf("expected launcher %q to contain %q", launcher, expected)
		}
	}
}

func TestInstallAndLaunchSandboxDaemonReportsLaunchFailure(t *testing.T) {
	box := &fakeDaemonBootstrapBox{
		execResult: &sdk.ExecResult{ExitCode: 127, Stderr: "daemon missing"},
	}

	err := installAndLaunchSandboxDaemon(t.Context(), box, "/host/daemon-amd64")
	if err == nil {
		t.Fatal("expected launch failure")
	}
	if !strings.Contains(err.Error(), "exit code 127") || !strings.Contains(err.Error(), "daemon missing") {
		t.Fatalf("expected exit code and stderr in error, got %v", err)
	}
}

func TestInstallAndLaunchSandboxDaemonWrapsExecError(t *testing.T) {
	box := &fakeDaemonBootstrapBox{execErr: errors.New("guest exec unavailable")}

	err := installAndLaunchSandboxDaemon(t.Context(), box, "/host/daemon-amd64")
	if err == nil {
		t.Fatal("expected exec error")
	}
	if !strings.Contains(err.Error(), "guest exec unavailable") {
		t.Fatalf("expected wrapped exec error, got %v", err)
	}
}
