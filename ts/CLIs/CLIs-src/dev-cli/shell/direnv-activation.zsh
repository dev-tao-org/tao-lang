# Sourced from interactive zsh startup after the user's own configuration.
[[ -o interactive ]] || return 0

typeset -g _tao_dev_home="$HOME/.tao-dev"
[[ -x "$_tao_dev_home/shell/direnv/bin/direnv" ]] || return 0
typeset -g _tao_dev_direnv="$_tao_dev_home/shell/direnv/bin/direnv"
typeset -gA _tao_dev_allowed
typeset -g _tao_dev_completed_root
typeset -g _tao_dev_disabled_root

_tao_dev_trusted_root() {
  local expected_choice=${1:-enabled} root common id record field registered=0
  root=$(command git rev-parse --show-toplevel 2>/dev/null) || return 1
  root=${root:A}
  [[ "${PWD:A}" == "$root" || "${PWD:A}" == "$root/"* ]] || return 1
  common=$(command git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 1
  common=${common:A}
  id=$(print -r -- "$common" | command git hash-object --stdin 2>/dev/null) || return 1
  record="$_tao_dev_home/shell/repositories/$id"
  [[ -f "$record/common-dir" && -f "$record/choice" ]] || return 1
  [[ "$(<"$record/common-dir")" == "$common" && "$(<"$record/choice")" == "$expected_choice" ]] || return 1
  while IFS= read -r -d '' field; do
    if [[ "$field" == "worktree $root" ]]; then
      registered=1
      break
    fi
  done < <(command git --git-dir="$common" worktree list --porcelain -z 2>/dev/null)
  (( registered )) || return 1
  print -r -- "$root"
}

_tao_dev_preserve_status() { return "$1" }

_tao_dev_managed_active_root() {
  local disabled_root=$1 active_root=${DIRENV_DIR#-} active_common disabled_common field registered=0
  [[ ${DIRENV_DIR-} == -* && -n "$active_root" ]] || return 1
  active_root=$(command git -C "$active_root" rev-parse --show-toplevel 2>/dev/null) || return 1
  active_root=${active_root:A}
  active_common=$(command git -C "$active_root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 1
  disabled_common=$(command git -C "$disabled_root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 1
  [[ "${active_common:A}" == "${disabled_common:A}" ]] || return 1
  while IFS= read -r -d '' field; do
    if [[ "$field" == "worktree $active_root" ]]; then
      registered=1
      break
    fi
  done < <(command git --git-dir="${disabled_common:A}" worktree list --porcelain -z 2>/dev/null)
  (( registered )) || return 1
  print -r -- "$active_root"
}

_tao_dev_unload_from_parent() {
  local root=$1 parent=${1:h} exports
  exports=$(builtin cd -q -- "$parent" && "$_tao_dev_direnv" export zsh) || return 1
  eval "$exports"
}

_tao_dev_create_envrc() {
  local root=$1 template="$_tao_dev_home/shell/envrc"
  [[ ! -e "$root/.envrc" && ! -L "$root/.envrc" && -f "$template" ]] || return 0
  [[ -f "$root/devenv.nix" && -f "$root/devenv.yaml" ]] || return 0
  command git -C "$root" ls-files --error-unmatch -- .envrc >/dev/null 2>&1 && return 0
  # Exclusive creation protects a file (including a symlink) another shell created.
  if (setopt noclobber; command cat -- "$template" > "$root/.envrc") 2>/dev/null; then
    print -r -- "Development shell: created $root/.envrc" >&2
  fi
}

_tao_dev_direnv_hook() {
  local previous_exit_status=$? root disabled_root active_root fingerprint completion
  root=$(_tao_dev_trusted_root)
  disabled_root=$(_tao_dev_trusted_root disabled)
  if [[ -n "$disabled_root" ]]; then
    if [[ "$_tao_dev_disabled_root" != "$disabled_root" ]]; then
      active_root=$(_tao_dev_managed_active_root "$disabled_root")
      if [[ -z "$active_root" ]] || _tao_dev_unload_from_parent "$active_root"; then
        _tao_dev_disabled_root=$disabled_root
      else
        _tao_dev_disabled_root=''
      fi
    fi
    _tao_dev_completed_root=''
    _tao_dev_preserve_status "$previous_exit_status"
    return "$previous_exit_status"
  fi
  _tao_dev_disabled_root=''
  [[ -n "$root" ]] && _tao_dev_create_envrc "$root"
  if [[ -n "$root" && -f "$root/.envrc" ]]; then
    fingerprint=$(command git hash-object -- "$root/.envrc" 2>/dev/null)
    if [[ -n "$fingerprint" && "${_tao_dev_allowed[$root]-}" != "$fingerprint" ]]; then
      if "$_tao_dev_direnv" allow "$root/.envrc"; then
        _tao_dev_allowed[$root]=$fingerprint
      fi
    fi
  fi

  # The real hook owns environment exports and unloading when leaving the checkout.
  _tao_dev_preserve_status "$previous_exit_status"
  _direnv_hook
  if [[ -z "$root" || "${DIRENV_DIR-}" != "-$root" ]]; then
    _tao_dev_completed_root=''
  elif [[ "$_tao_dev_completed_root" != "$root" ]]; then
    # Setup generates these files. Entering a checkout must never invoke its CLI
    # bootstrap, which can install dependencies in a fresh or stale worktree.
    completion="$root/.artifacts/cache/dev-shell/completion.zsh"
    [[ -r "$completion" ]] || completion="$_tao_dev_home/shell/completion.zsh"
    if [[ -r "$completion" ]]; then
      if ! (( $+functions[compdef] )); then
        autoload -Uz compinit
        compinit -D
      fi
      if source "$completion"; then
        _tao_dev_completed_root=$root
      fi
    fi
  fi
  return "$previous_exit_status"
}

# Replace any earlier installation (including the user's own direnv hook) with one
# ordered hook. Sourcing this file repeatedly retains the per-shell caches.
# Direnv warns, and suggests cancelling, when `direnv export` exceeds 5s. A cold
# devenv evaluation takes about that long and then finishes; zero disables the
# watchdog. A timeout already chosen in the shell is left alone.
[[ -n ${DIRENV_WARN_TIMEOUT-} ]] || export DIRENV_WARN_TIMEOUT=0s
eval "$("$_tao_dev_direnv" hook zsh)"
precmd_functions=(${precmd_functions:#_direnv_hook})
precmd_functions=(${precmd_functions:#_tao_dev_direnv_hook} _tao_dev_direnv_hook)
chpwd_functions=(${chpwd_functions:#_direnv_hook})
chpwd_functions=(${chpwd_functions:#_tao_dev_direnv_hook} _tao_dev_direnv_hook)
