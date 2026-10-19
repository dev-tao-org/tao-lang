# Sourced by the thin CLI entrypoints before Bun or workspace dependencies are loaded.
repository=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$repository/.config/prepared-environment.sh"
tao_environment_key=$(tao_environment_identity "$repository") || {
  printf 'Tao could not fingerprint this checkout environment. Run the command from a complete Git checkout and verify git hash-object works.\n' >&2
  exit 1
}
active_environment=
if [ -n "${DEVENV_ROOT:-}" ]; then
  active_environment=$(CDPATH= cd -- "$DEVENV_ROOT" 2>/dev/null && pwd -P) || active_environment=
fi
if [ "${TAO_DEVENV:-}" != 1 ] || [ "$active_environment" != "$repository" ]; then
  if tao_reuse_prepared_environment; then
    : # Reuse the prepared generation without another devenv activation or GC-root write.
  elif ! command -v devenv >/dev/null 2>&1; then
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
    export TAO_ENVIRONMENT_INPUTS="$tao_environment_key"
    exec devenv shell --no-tui -- "$repository/$entrypoint" "$@"
  fi
fi
tao_record_prepared_environment
if [ "${TAO_DEVENV_KIND:-}" = portable ]; then
  export LD_LIBRARY_PATH="$repository/.devenv/profile/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
export PATH="$repository/ts/node_modules/.bin:$repository:$PATH"
# Include package tool paths before installation so fresh setup can resolve newly installed tools.
for workspace_package in "$repository"/ts/*; do
  if [ -f "$workspace_package/package.json" ]; then
    export PATH="$workspace_package/node_modules/.bin:$PATH"
  fi
done
