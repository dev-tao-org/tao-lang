# Common developer commands, for discovery
# ALL `./dev ...` passthroughs should be a single line, with the dev command performing all the steps

set quiet

# Print available recipes
help:
    just --list

# Repo dev environment setup
############################

# Install repository dependencies in the pinned devenv shell (same entry as ./agent setup and harness hooks).
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
doctor:
    ./dev doctor

# Clean all tao artifacts
[group('Setup')]
clean:
    ./dev clean

# Dev loop
##########

# Run tests
[group('Dev')]
test target="":
    ./dev test {{ quote(target) }}

# Format code, optionally only named files or dprint globs, without applying the other Tao source fixes
[group('Dev')]
[positional-arguments]
fmt *PATHS:
    ./dev fmt {{ PATHS }}

# Apply every auto-fix, writing to the tree: dprint formatting, Tao source fixes, Justfile formatting, dead imports, etc
[group('Dev')]
fix:
    ./dev fix

# Check all code, fail fast between checks: canonical source, lint, types, dead imports, etc.
[group('Dev')]
check:
    ./dev check

# Run the repository lint
[group('Dev')]
lint:
    ./dev lint

# Run full verification on the repo
[group('Dev')]
verify:
    ./dev verify

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
