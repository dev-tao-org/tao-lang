{ pkgs, inputs, lib, ... }:

let
  bunPkgs = import inputs.bun-nixpkgs { system = pkgs.stdenv.system; };
in
{
  name = "tao-lang";

  # Tao's shell needs Nix-provided JS/dev tools, but native iOS builds should keep
  # using Xcode/CocoaPods directly. Nix compiler wrappers can break Apple flags.
  stdenv = if pkgs.stdenv.isDarwin then pkgs.stdenvNoCC else pkgs.stdenv;
  apple.sdk = null;

  enterShell = lib.mkAfter ''
    export PATH="$DEVENV_ROOT/ts/node_modules/.bin:$DEVENV_ROOT:$PATH"
    # Android integration generates this at shell entry; the repository root is not a Gradle project.
    if [ -f "$DEVENV_ROOT/local.properties" ]; then
      mv -f "$DEVENV_ROOT/local.properties" "$DEVENV_ROOT/.config/local.properties"
    fi
  '';

  android = {
    enable = true;
    reactNative.enable = true;
    platforms.version = [ "36" ];
    buildTools.version = [ "36.0.0" "35.0.0" ];
    # Expo SDK 57's expo-updates plugin still requests 27.0 while React Native uses 27.1.
    ndk.version = [ "27.0.12077973" "27.1.12297006" ];
    abis = [ "arm64-v8a" ];
    systemImageTypes = [ "google_apis" ];
    android-studio.enable = false;
  };

  packages = [
    bunPkgs.bun
    (pkgs.lib.getBin pkgs.nodejs_24)
    pkgs.just
    pkgs.gnumake
    pkgs.python3
    pkgs.dprint
    pkgs.git
    pkgs.gh
    pkgs.age
    pkgs.ripgrep
    pkgs.cocoapods
    pkgs.direnv
  ] ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [ pkgs.age-plugin-se pkgs.netbird ]
    ++ pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.stdenv.cc ];

  env.TAO_DEVENV = "1";
  env.LANG = "en_US.UTF-8";
  env.LC_ALL = "en_US.UTF-8";
  env.LC_CTYPE = "en_US.UTF-8";

  # scripts.tao = {
  #   exec = ''"$DEVENV_ROOT/tao" "$@" '';
  #   description = "Tao language CLI";
  # };
  scripts.j = {
    exec = ''just "$@"'';
    description = "just";
  };
  scripts.t = {
    exec = ''just test "$@"'';
    description = "just test";
  };
  scripts.f = {
    exec = ''just fix "$@"'';
    description = "just fix";
  };
  scripts.v = {
    exec = ''just verify "$@"'';
    description = "just verify";
  };
  scripts.c = {
    exec = ''just check "$@"'';
    description = "just check";
  };
  scripts.cl = {
    exec = ''just clean "$@"'';
    description = "just clean";
  };
}
