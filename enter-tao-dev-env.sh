#!/bin/sh
# Enter this checkout's development shell instead of using direnv; setup runs before the shell opens.
set -eu

# Accept only the noninteractive setup mode or the default interactive shell.
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != --setup-only ]; }; then
  printf 'Usage: ./enter-tao-dev-env.sh [--setup-only]\n' >&2
  exit 2
fi

# Resolve this script's checkout independently of the caller's current directory.
repository=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd "$repository"

# Avoid nesting an interactive shell when this checkout's environment is already active.
if [ "$#" -eq 0 ] && [ "${TAO_DEVENV:-}" = 1 ] && [ -n "${DEVENV_ROOT:-}" ] &&
  [ "$(CDPATH= cd -- "$DEVENV_ROOT" 2>/dev/null && pwd -P)" = "$repository" ]; then
  printf 'Tao development environment is already active for this checkout; keeping the current shell.\n'
  exit 0
fi

# Environment provisioning needs the developer's installed Nix/devenv toolchain.
if ! command -v devenv >/dev/null 2>&1; then
  printf 'Tao development needs devenv and Nix installed before this shell can start.\n' >&2
  exit 1
fi

# Setup-only exits after installing dependencies inside the pinned environment.
export DEVENV_TUI=false
if [ "${1:-}" = --setup-only ]; then
  exec devenv shell --no-tui ./agent unsandboxed setup
fi

# Replace this process with the developer's interactive shell after successful setup.
exec devenv shell --no-tui -- sh -ec './agent unsandboxed setup; exec "$1" -i' tao-dev-shell "${SHELL:-/bin/sh}"
