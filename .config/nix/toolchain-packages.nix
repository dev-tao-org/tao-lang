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
    pkgs.ripgrep
    pkgs.zsh
  ];
}
