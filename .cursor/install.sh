#!/usr/bin/env bash
set -euo pipefail

# Bun is the toolchain every project script runs on, and it is not in the base
# image. Install it idempotently.
if [ ! -x "$HOME/.bun/bin/bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

bun install --frozen-lockfile

# Configure an isolated anonymous Convex deployment (no login needed), push the
# schema and functions, and generate types. Piping "n" declines the one-time
# "Set up Convex AI files?" prompt so a fresh machine stays non-interactive.
printf 'n\n' | CONVEX_AGENT_MODE=anonymous bunx convex dev --once
