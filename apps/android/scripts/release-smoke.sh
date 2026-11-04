#!/usr/bin/env bash
# Launch smoke test for the minified release APK.
#
# R8 strips code that is only reached by reflection, and nothing at build time
# notices. proguard-rules.pro records two release-only breakages that passed a
# green pipeline; the ML Kit one announced itself the moment the app started.
# This installs the APK, cold-starts it with the network off, and fails if the
# process died, crashed, or Firebase component discovery could not instantiate
# a registrar.
#
# Usage: scripts/release-smoke.sh path/to/app-release.apk
#
# Needs exactly one booted device or emulator; set ADB if adb is not on PATH.
# It uninstalls fit.aquazero.app first, because a release and a debug build are
# signed differently and cannot replace each other, so any app data on the
# device is lost.
set -euo pipefail

apk="${1:?usage: release-smoke.sh <apk>}"
adb="${ADB:-adb}"
pkg=fit.aquazero.app
settle_seconds="${SMOKE_SETTLE_SECONDS:-15}"

running_pid() { "$adb" shell pidof "$pkg" | tr -d '\r' || true; }

"$adb" uninstall "$pkg" >/dev/null 2>&1 || true
"$adb" install "$apk"

# Offline on purpose. The release build talks to production and a smoke test
# has no business sending it traffic; a cold start with no network is also a
# path real users take. Restored on exit so a shared device is left as found.
"$adb" shell cmd connectivity airplane-mode enable
trap '"$adb" shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true' EXIT

"$adb" logcat -c
"$adb" shell am start -W -n "$pkg/.MainActivity"
# Settle on the device: Application.onCreate, the init providers and the
# first frames all run after `am start -W` returns.
"$adb" shell sleep "$settle_seconds"

# The pid the system started, read from ActivityManager's log rather than from
# the live process list: a process that crashed during startup is no longer
# listed, and its log lines are the ones that matter.
pid=$("$adb" logcat -d -b system | grep -oE "Start proc [0-9]+:$pkg/" | tail -n 1 | grep -oE '[0-9]+' || true)

failed=0

if [ -z "$pid" ] || [ "$(running_pid)" != "$pid" ]; then
  echo "::error::$pkg is not running ${settle_seconds}s after launch."
  failed=1
fi

crash=$("$adb" logcat -d -b crash | grep -A 30 "Process: $pkg" || true)
if [ -n "$crash" ]; then
  echo "::error::$pkg crashed during startup:"
  echo "$crash"
  failed=1
fi

# Only this tag, and only from the app's own process. Play services logs
# benign exceptions into the same process on every start, so a broad match on
# "Exception" would fail healthy builds.
if [ -n "$pid" ]; then
  discovery=$("$adb" logcat -d --pid="$pid" | grep -A 3 'ComponentDiscovery' || true)
  if [ -n "$discovery" ]; then
    echo "::error::Firebase component discovery failed (in a release build, usually a keep rule):"
    echo "$discovery"
    failed=1
  fi
fi

[ "$failed" -eq 0 ] || exit 1
echo "Release build started cleanly and was still running after ${settle_seconds}s."
