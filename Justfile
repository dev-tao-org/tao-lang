# Common developer commands, for discovery
# Each recipe calls one complete ./dev command; justified exceptions are documented below.

set quiet

# Print available recipes
# Exception: Just owns this menu, which must work before CLI dependencies are installed.
help:
    just --list

# Repo dev environment setup
############################

# Install repository dependencies in the pinned devenv shell (same entry as ./agent setup and harness hooks).
# Exception: activate the pinned environment before starting the setup runner shared with harness hooks.
[group('Setup')]
setup *ARGS:
    TAO_DEV_SHELL_SETUP=0 devenv shell --no-tui ./agent setup {{ ARGS }}

# Configure this checkout and GitHub CLI for HTTPS Git authentication
[group('Setup')]
setup-github:
    ./dev setup-github

# Decrypt the repository secrets into .env.secrets; `add <KEY>`, `list`, or `setup` to manage them
[group('Setup')]
secrets *ARGS:
    ./dev secrets {{ ARGS }}

# Diagnose this checkout without changing it; pass --json for a structured report
[group('Setup')]
doctor *ARGS:
    ./dev doctor {{ ARGS }}

# Remove dependencies owned by the new TypeScript workspace
[group('Setup')]
clean:
    ./dev clean

# Dev loop
##########

# Run tests in the new TypeScript workspace
[group('Dev')]
test target="":
    ./dev test {{ quote(target) }}

# Format code, optionally only named files or dprint globs, without applying the other Tao source fixes
[group('Dev')]
[positional-arguments]
fmt *PATHS:
    ./dev fmt {{ PATHS }}

# Apply available new-workspace fixes and shared repository formatting
[group('Dev')]
fix:
    ./dev fix

# Check new-workspace types, source conformance and formatting without running tests
[group('Dev')]
check *ARGS:
    ./dev check {{ ARGS }}

# Check exported API JSDoc, private comments, Try usage and S templates in the new workspace
[group('Dev')]
lint:
    ./dev lint

# Format, check and test the new TypeScript workspace
[group('Dev')]
verify *ARGS:
    ./dev verify {{ ARGS }}

# Dev branch management
#######################

# Switch to your own dev/* branch, creating it from main the first time
[group('Dev Branch Management')]
my-branch name='':
    ./dev my-branch {{ quote(name) }}

# Synchronize main and merge it into the current development branch
[group('Dev Branch Management')]
my-sync:
    ./dev my-sync

# Dev environment services
##########################

# Start the official self-hosted InstantDB stack and provision WordFlower's local app
[group('Services')]
start-local-instantdb:
    ./dev start local-instantdb

# Stop local InstantDB while preserving its database and object-storage volumes
[group('Services')]
stop-local-instantdb:
    ./dev stop local-instantdb
