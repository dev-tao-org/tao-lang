# Prepare the semantic AST before a command graph imports it in a fresh worktree.
if [ ! -f "$repository/ts/2-ast-gen/_gen_AST/AST-generated.ts" ]; then
  if [ ! -d "$repository/ts/node_modules" ]; then
    printf 'Cannot prepare the generated Tao AST because TypeScript dependencies are missing. Run ./agent unsandboxed setup, then retry.\n' >&2
    exit 1
  fi
  if bun run "./CLIs/CLIs-src/cli-checks/prepare-cli-generated.ts"; then
    :
  else
    status=$?
    printf 'Could not prepare the generated Tao AST. Run ./agent unsandboxed setup to repair the workspace, then retry.\n' >&2
    exit "$status"
  fi
fi
