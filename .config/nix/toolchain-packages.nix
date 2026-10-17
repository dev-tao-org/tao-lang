{ pkgs, bunPkgs }:

{
  packages = [
    bunPkgs.bun
    pkgs.nodejs_24
    pkgs.age
    pkgs.coreutils
    pkgs.dprint
    pkgs.gh
    pkgs.git
    pkgs.just
    pkgs.gnumake
    pkgs.python3
    pkgs.ripgrep
    pkgs.zsh
  ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.stdenv.cc ];
}
