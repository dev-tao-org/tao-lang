# Common developer commands, for discovery
# Each recipe calls one complete ./dev command; justified exceptions are documented below.

set quiet

# Print available recipes
# Exception: Just owns this menu, which must work before CLI dependencies are installed.
help:
    just --list

# Repo dev environment setup
############################

# Install repository dependencies through the environment-aware setup runner.
[group('Setup')]
[positional-arguments]
setup *ARGS:
    ./dev setup "$@"

# Configure this checkout and GitHub CLI for HTTPS Git authentication
[group('Setup')]
setup-github:
    ./dev setup-github

# Decrypt the repository secrets into .env.secrets; `add <KEY>`, `list`, or `setup` to manage them
[group('Setup')]
[positional-arguments]
secrets *ARGS:
    ./dev secrets "$@"

# Diagnose this checkout without changing it; pass --json for a structured report
[group('Setup')]
[positional-arguments]
doctor *ARGS:
    ./dev doctor "$@"

# Configure optional automatic development environments for this repository and its worktrees
[group('Setup')]
shell-setup:
    ./dev shell-setup --configure

# Install the official Tailscale macOS app; sign in and approve native prompts afterward
[group('Setup')]
[positional-arguments]
tailscale-install *ARGS:
    ./dev tailscale-install "$@"

# Set up private timing networking for the controller or runner
[group('Setup')]
[positional-arguments]
timing-setup ROLE *ARGS:
    shift; exec ./dev {{ quote("timing-setup-" + ROLE) }} "$@"

# Set up a dedicated SSH key for a selected machine
[group('Setup')]
[positional-arguments]
ssh-key-setup HOST *ARGS:
    ./dev ssh-key-setup "$@"

# Measure on the dedicated timing runner. Use --local for a diagnostic on this Mac.
[group('Performance')]
[positional-arguments]
timing *ARGS:
    ./dev timing "$@"

# Follow the timing laptop over SSH; pass --local to follow this machine
[group('Performance')]
[positional-arguments]
timing-watch *ARGS:
    ./dev timing-watch "$@"

# Remove dependencies owned by the new TypeScript workspace
[group('Setup')]
clean:
    ./dev clean

# Remove new workspace dependencies and all shared checkout artifacts
[group('Setup')]
clean-full:
    ./dev clean --full

# Dev loop
##########

# Run TypeScript tests and all Tao app tests
[group('Dev')]
test target="":
    ./dev test {{ quote(target) }}

# Format code, optionally only named files or dprint globs, without applying the other Tao source fixes
[group('Dev')]
[positional-arguments]
fmt *PATHS:
    ./dev fmt "$@"

# Apply available new-workspace fixes and shared repository formatting
[group('Dev')]
fix:
    ./dev fix

# Check new-workspace types, source conformance, dead exports and formatting without tests
[group('Dev')]
[positional-arguments]
check *ARGS:
    ./dev check "$@"

# Diagram direct TypeScript imports between workspace packages
[group('Dev')]
package-graph:
    ./dev package-graph

# Format, check and test the new TypeScript workspace
[group('Dev')]
[positional-arguments]
verify *ARGS:
    ./dev verify "$@"

# Dev branch management
#######################

# Switch to your existing personal dev/* branch
[group('Dev Branch Management')]
my-branch name='':
    ./dev my-branch {{ quote(name) }}

# Dev environment services
##########################

# Open development apps with keyboard shortcuts
[group('Dev')]
dev:
    ./dev

# Build both Tao extensions and install them into Cursor and VS Code
[group('Dev')]
install-ide-extension:
    ./dev install-ide-extension

# Start the official self-hosted InstantDB stack and provision WordFlower's local app
[group('Services')]
start-local-instantdb:
    ./dev start local-instantdb

# Stop local InstantDB while preserving its database and object-storage volumes
[group('Services')]
stop-local-instantdb:
    ./dev stop local-instantdb
