#!/bin/sh
# Cursor runs this from .cursor/worktrees.json when it creates a worktree, before an agent works
# in it. Root `./agent unsandboxed setup` installs locked dependencies and initializes missing storage.
# Worktrunk's pre-start hook (.config/wt.toml)
# and the Claude Code and Codex SessionStart hooks (.rulesync/hooks.jsonc) run the same entry;
# keep those references in step when changing setup.
# worktrees.json is plain JSON with no room for comments, which is why this script exists.
set -e
repository=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$repository"
exec ./agent unsandboxed setup
