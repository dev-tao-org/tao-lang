# Sourced by the thin CLI entrypoints before Bun or workspace dependencies are loaded.
repository=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
active_environment=
if [ -n "${DEVENV_ROOT:-}" ]; then
  active_environment=$(CDPATH= cd -- "$DEVENV_ROOT" 2>/dev/null && pwd -P) || active_environment=
fi
if [ "${TAO_DEVENV:-}" != 1 ] || [ "$active_environment" != "$repository" ]; then
  if ! command -v devenv >/dev/null 2>&1; then
    if [ "$(uname -s)" = Linux ] && [ -d "$repository/.devenv/portable-generations" ]; then
      "$repository/.config/bootstrap-tao-dev-env" --tools-only
      export PATH="$repository/.devenv/profile/bin:$PATH"
      export DEVENV_ROOT="$repository"
      export TAO_DEVENV=1
      export TAO_DEVENV_KIND=portable
    else
      printf 'Tao commands require Nix and devenv, or the configured portable Linux profile.\n' >&2
      exit 1
    fi
  else
    entrypoint=$(basename -- "$0")
    cd "$repository"
    exec devenv shell --no-tui -- "$repository/$entrypoint" "$@"
  fi
fi
export PATH="$repository/ts/node_modules/.bin:$repository:$PATH"
# Workspace packages own their tools; make their local binaries available by name.
for package_tools in "$repository"/ts/*/node_modules/.bin; do
  if [ -d "$package_tools" ]; then
    export PATH="$package_tools:$PATH"
  fi
done
