# Prepared CLI activation retains only toolchain settings, never the caller's credentials or PATH.
tao_environment_identity() {
  tao_environment_hashes=$(cd "$1" && git hash-object devenv.nix devenv.yaml devenv.lock \
    .config/cli-environment.sh .config/prepared-environment.sh) || return 1
  printf '%s\n' "$tao_environment_hashes" | git hash-object --stdin
}

tao_read_prepared_environment() {
  tao_prepared_root=$1
  tao_prepared_file="$tao_prepared_root/.devenv/cli-environment/$tao_environment_key"
  [ -f "$tao_prepared_file" ] && [ -x "$tao_prepared_root/.devenv/profile/bin/bun" ] || return 1
  [ -x "$tao_prepared_root/.devenv/profile/bin/node" ] || return 1
  IFS= read -r tao_prepared_profile < "$tao_prepared_file"
  [ "$tao_prepared_profile" = "$(readlink "$tao_prepared_root/.devenv/profile")" ] || return 1
  while IFS='=' read -r tao_prepared_name tao_prepared_value; do
    case "$tao_prepared_name" in
      ANDROID_HOME|ANDROID_SDK_ROOT|ANDROID_NDK_ROOT|JAVA_HOME|LANG|LC_ALL|LC_CTYPE|PATH_LOCALE|PYTHONPATH|PYTHONNOUSERSITE)
        export "$tao_prepared_name=$tao_prepared_value" ;;
    esac
  done < "$tao_prepared_file"
  export PATH="$tao_prepared_root/.devenv/profile/bin:$PATH"
  export DEVENV_ROOT="$repository" TAO_DEVENV=1
}

tao_reuse_prepared_environment() {
  tao_read_prepared_environment "$repository" && return 0
  tao_common_git=$(git -C "$repository" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 1
  tao_primary_root=$(dirname "$tao_common_git")
  [ "$tao_primary_root" != "$repository" ] || return 1
  tao_read_prepared_environment "$tao_primary_root"
}

tao_record_prepared_environment() {
  [ "${TAO_ENVIRONMENT_INPUTS:-}" = "$tao_environment_key" ] || return 0
  [ -L "$repository/.devenv/profile" ] || return 0
  tao_prepared_directory="$repository/.devenv/cli-environment"
  mkdir -p "$tao_prepared_directory"
  tao_prepared_stage="$tao_prepared_directory/$tao_environment_key.$$"
  (
    readlink "$repository/.devenv/profile"
    for tao_prepared_name in ANDROID_HOME ANDROID_SDK_ROOT ANDROID_NDK_ROOT JAVA_HOME LANG LC_ALL LC_CTYPE PATH_LOCALE PYTHONPATH PYTHONNOUSERSITE; do
      tao_prepared_value=$(printenv "$tao_prepared_name") || continue
      case "$tao_prepared_value" in
        *'
'*) exit 1 ;;
      esac
      printf '%s=%s\n' "$tao_prepared_name" "$tao_prepared_value"
    done
  ) > "$tao_prepared_stage" && mv -f "$tao_prepared_stage" "$tao_prepared_directory/$tao_environment_key"
  rm -f "$tao_prepared_stage"
  unset TAO_ENVIRONMENT_INPUTS
}
