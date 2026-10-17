#!/bin/sh
# Explicit installation into a disposable Linux environment; never replace an existing Nix.
set -eu

[ "$#" -eq 0 ] || { printf 'Nix bootstrap takes no arguments.\n' >&2; exit 2; }
[ "$(uname -s)" = Linux ] || { printf 'Nix bootstrap supports Linux only.\n' >&2; exit 1; }
case "$(uname -m)" in
  x86_64) bootstrap_system=x86_64-linux; bootstrap_digest=0c3960a9792331a22081c3c7a5d8465db9b17c50b3acdf18587fa4c6f2cb1158 ;;
  aarch64) bootstrap_system=aarch64-linux; bootstrap_digest=4d0302a2910f5eec1c33b8deef634f04899a75737e7001ec49908d003ae5efda ;;
  *) printf 'Nix bootstrap supports Linux x86_64 and aarch64 only.\n' >&2; exit 1 ;;
esac

for bootstrap_tool in flock curl sha256sum tar xz mktemp readlink; do
  command -v "$bootstrap_tool" >/dev/null 2>&1 || { printf 'Nix bootstrap needs %s.\n' "$bootstrap_tool" >&2; exit 1; }
done
bootstrap_state="$HOME/.local/state/tao-contributor"
mkdir -p "$bootstrap_state"
exec 9>"$bootstrap_state/nix-bootstrap.lock"
flock -w 600 9 || { printf 'Timed out waiting for Nix installation.\n' >&2; exit 1; }
bootstrap_marker="$bootstrap_state/nix-bootstrap"
bootstrap_pending="$bootstrap_marker.pending"
if [ -e "$bootstrap_pending" ] || [ -L "$bootstrap_pending" ]; then
  printf 'An earlier Nix installation is incomplete: %s. Recover or recreate the disposable guest.\n' "$bootstrap_pending" >&2
  exit 1
fi
for bootstrap_existing in "$(command -v nix-build || true)" "$HOME/.nix-profile/bin/nix-build" /nix/var/nix/profiles/default/bin/nix-build; do
  if [ -n "$bootstrap_existing" ] && [ -x "$bootstrap_existing" ]; then
    printf 'Nix bootstrap: reusing %s\n' "$bootstrap_existing"
    exit 0
  fi
done

bootstrap_version=2.35.2
bootstrap_archive="nix-$bootstrap_version-$bootstrap_system"
mkdir -p .artifacts/nix-bootstrap
bootstrap_download=$(mktemp -d "$PWD/.artifacts/nix-bootstrap/download.XXXXXXXX")
bootstrap_next=
cleanup_bootstrap() {
  bootstrap_status=$?
  trap - EXIT
  rm -rf -- "$bootstrap_download" || bootstrap_status=1
  if [ -n "$bootstrap_next" ]; then rm -f -- "$bootstrap_next" || bootstrap_status=1; fi
  exit "$bootstrap_status"
}
trap cleanup_bootstrap EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

curl --fail --location --proto '=https' --proto-redir '=https' \
  --output "$bootstrap_download/$bootstrap_archive.tar.xz" \
  "https://releases.nixos.org/nix/nix-$bootstrap_version/$bootstrap_archive.tar.xz"
(cd "$bootstrap_download" && printf '%s  %s.tar.xz\n' "$bootstrap_digest" "$bootstrap_archive" | sha256sum --check --status)
tar -xJf "$bootstrap_download/$bootstrap_archive.tar.xz" -C "$bootstrap_download"
printf 'version=%s\nprofile=%s\n' "$bootstrap_version" "$HOME/.nix-profile" > "$bootstrap_pending"
bootstrap_root=false
if [ "$(id -u)" = 0 ]; then
  bootstrap_root=true
  mkdir -p /nix
  NIX_CONFIG="${NIX_CONFIG:+$NIX_CONFIG
}store = local
build-users-group =
sandbox = false"
  export NIX_CONFIG
fi
printf 'owner=explicit disposable Linux bootstrap\nstore=/nix\nprofile=%s\npending=%s\ncleanup=remove the guest, never a host Nix installation\n' \
  "$HOME/.nix-profile" "$bootstrap_pending" > .artifacts/nix-bootstrap/ownership.txt
/bin/sh "$bootstrap_download/$bootstrap_archive/install" --no-daemon --no-channel-add --no-modify-profile --yes
[ -x "$HOME/.nix-profile/bin/nix-build" ] || { printf 'Nix installation did not produce nix-build.\n' >&2; exit 1; }
if "$bootstrap_root"; then
  bootstrap_next="$bootstrap_marker.next-$$"
  readlink -f "$HOME/.nix-profile/bin/nix-build" > "$bootstrap_next"
  mv -f "$bootstrap_next" "$bootstrap_marker"
  bootstrap_next=
fi
rm -f -- "$bootstrap_pending"
printf 'Nix bootstrap: installed Nix %s.\n' "$bootstrap_version"
