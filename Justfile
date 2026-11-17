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

# Install/start CLI-only private networking and sign in on this controller Mac
[group('Setup')]
[positional-arguments]
timing-setup-controller *ARGS:
    ./dev timing-setup-controller "$@"

# Install/start CLI-only private networking and sign in on the timing Mac
[group('Setup')]
[positional-arguments]
timing-setup-runner *ARGS:
    ./dev timing-setup-runner "$@"

# Authenticate an existing SSH login and return here without opening a remote shell
[group('Performance')]
[positional-arguments]
timing-connect HOST *ARGS:
    ./dev timing-connect "$@"

# Set up a dedicated SSH key for a selected machine
[group('Setup')]
[positional-arguments]
ssh-key-setup HOST *ARGS:
    ./dev ssh-key-setup "$@"

# Initialize shared ~/.tao-dev timing storage without installing network software
[group('Performance')]
[positional-arguments]
timing-home *ARGS:
    ./dev timing-home "$@"

# Close the saved reusable SSH connection to the timing Mac
[group('Performance')]
[positional-arguments]
timing-disconnect HOST *ARGS:
    ./dev timing-disconnect "$@"

# Connect, measure, print and close a private one-shot timing session
[group('Performance')]
[positional-arguments]
timing-session HOST CHECKOUT *ARGS:
    ./dev timing-session "$@"

# Repeat measurements in an immutable runner checkout; source is not synchronized
[group('Performance')]
[positional-arguments]
timing-run HOST CHECKOUT *ARGS:
    ./dev timing-run "$@"

# Compare preview timings across prepared baseline and candidate revisions
[group('Performance')]
[positional-arguments]
timing-compare HOST BASELINE CANDIDATE *ARGS:
    ./dev timing-compare "$@"

# Follow the timing laptop over SSH; pass --local to follow this machine
[group('Performance')]
[positional-arguments]
timing-watch *ARGS:
    ./dev timing-watch "$@"

# Print a retained timing report without launching measurements
[group('Performance')]
[positional-arguments]
timing-report HOST CHECKOUT *ARGS:
    ./dev timing-report "$@"

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

# Measure preview refresh and print scenario timings and the raw report path
[group('Dev')]
performance:
    ./dev performance preview

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
