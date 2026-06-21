#!/usr/bin/env python3
"""Validate release.yaml — the declarative release request.

Usage: python3 scripts/release/validate_manifest.py [release.yaml]

Exits 0 when the manifest is well-formed, 1 otherwise. This is the contract the
release orchestrator relies on, so it runs as the first step of release-plan and
can be run locally before opening a release PR.
"""
import sys

try:
    import yaml
except ImportError:
    sys.exit("error: PyYAML not installed (pip install pyyaml)")

STAGES = {"dev", "prod"}
CHANNELS = {"stable", "rc"}
RUNNER_MODES = {"skip", "upgrade"}


def validate(doc: dict) -> tuple[list[str], list[str]]:
    """Return (errors, warnings). Errors fail validation; warnings do not."""
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(doc, dict):
        return ["top level must be a mapping"], warnings

    if "commit" not in doc or not isinstance(doc.get("commit"), str):
        errors.append("`commit` must be a string (empty string = current HEAD)")

    trains = doc.get("trains")
    if not isinstance(trains, dict):
        return errors + ["`trains` must be a mapping with oss/cloud/runner"], warnings

    for name in ("oss", "cloud", "runner"):
        if name not in trains:
            errors.append(f"trains.{name} is missing")

    enabled_count = 0

    oss = trains.get("oss", {})
    if isinstance(oss, dict):
        if not isinstance(oss.get("enabled"), bool):
            errors.append("trains.oss.enabled must be true/false")
        if oss.get("enabled"):
            enabled_count += 1
            if not oss.get("version"):
                errors.append("trains.oss.version is required when oss is enabled")
        if oss.get("channel") not in CHANNELS:
            errors.append(f"trains.oss.channel must be one of {sorted(CHANNELS)}")

    cloud = trains.get("cloud", {})
    if isinstance(cloud, dict):
        if not isinstance(cloud.get("enabled"), bool):
            errors.append("trains.cloud.enabled must be true/false")
        if cloud.get("enabled"):
            enabled_count += 1
        if cloud.get("stage") not in STAGES:
            errors.append(f"trains.cloud.stage must be one of {sorted(STAGES)}")

    runner = trains.get("runner", {})
    if isinstance(runner, dict):
        if not isinstance(runner.get("enabled"), bool):
            errors.append("trains.runner.enabled must be true/false")
        if runner.get("enabled"):
            enabled_count += 1
        if runner.get("mode") not in RUNNER_MODES:
            errors.append(f"trains.runner.mode must be one of {sorted(RUNNER_MODES)}")

    if enabled_count == 0:
        warnings.append("no train is enabled — this manifest is a no-op (fine for the template at rest)")

    return errors, warnings


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "release.yaml"
    try:
        with open(path, encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
    except FileNotFoundError:
        print(f"FAIL: {path} not found")
        return 1
    except yaml.YAMLError as exc:
        print(f"FAIL: {path} is not valid YAML: {exc}")
        return 1

    errors, warnings = validate(doc)
    for w in warnings:
        print(f"  warning: {w}")
    if errors:
        print(f"FAIL: {path} has {len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"OK: {path} is a valid release request")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
