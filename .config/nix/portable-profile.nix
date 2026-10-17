{ system ? builtins.currentSystem }:

let
  lock = builtins.fromJSON (builtins.readFile ../../devenv.lock);
  pinnedSource = name:
    let source = lock.nodes.${name}.locked;
    in builtins.fetchTarball {
      url = "https://github.com/${source.owner}/${source.repo}/archive/${source.rev}.tar.gz";
      sha256 = source.narHash;
    };
  pkgs = import (pinnedSource "nixpkgs-src") { inherit system; };
  bunPkgs = import (pinnedSource "bun-nixpkgs") { inherit system; };
  tools = import ./toolchain-packages.nix { inherit pkgs bunPkgs; };
in
pkgs.buildEnv {
  name = "tao-typescript-portable-profile";
  paths = tools.packages;
}
