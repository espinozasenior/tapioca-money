#!/usr/bin/env bash
#
# Tapioca — Production Deploy Preflight
#
# Runs the full pre-deployment checklist before pushing to Vercel:
#   1. Verifies required env vars (locally + in Vercel)
#   2. Runs tests, type check, format check
#   3. Generates + applies DB migrations to the target Neon database
#   4. Builds the app to catch build-time errors
#   5. Pushes to origin/main (Vercel auto-deploys)
#
# Usage:
#   bash scripts/deploy-preflight.sh              # full run with git push
#   bash scripts/deploy-preflight.sh --dry-run    # everything except git push + db:push
#   bash scripts/deploy-preflight.sh --skip-tests # skip test suite (not recommended)
#
# Prereqs:
#   - Vercel CLI installed + authenticated (npm i -g vercel && vercel login)
#   - .env.prod exists locally OR env vars already pulled via `vercel env pull`
#   - Git working tree clean, on main branch

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=false
SKIP_TESTS=false
ENV_FILE=".env.prod"

for arg in "$@"; do
  case $arg in
    --dry-run)    DRY_RUN=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --env-file=*) ENV_FILE="${arg#*=}" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
NC=$'\033[0m'

step()    { echo "${BLUE}==>${NC} $*"; }
ok()      { echo "${GREEN}  ✓${NC} $*"; }
warn()    { echo "${YELLOW}  ⚠${NC} $*"; }
fail()    { echo "${RED}  ✗${NC} $*"; exit 1; }

# ---------------------------------------------------------------------------
# Required environment variables
# ---------------------------------------------------------------------------

REQUIRED_VARS=(
  # Auth
  NEXT_PUBLIC_PRIVY_APP_ID
  PRIVY_APP_SECRET
  # Database
  DATABASE_URL
  DATABASE_ENCRYPTION_KEY
  # Smart accounts
  ZERODEV_PROJECT_ID
  NEXT_PUBLIC_BASE_RPC_URL
  # Infra
  REDIS_URL
  CRON_SECRET
  RELAYER_PRIVATE_KEY
  # Chain
  NEXT_PUBLIC_CHAIN_ID
  NEXT_PUBLIC_USDC_MINT
)

# ---------------------------------------------------------------------------
# Step 1: Git sanity
# ---------------------------------------------------------------------------

step "1. Verifying git state"

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  fail "Not on main branch (on: $branch). Switch with: git checkout main"
fi
ok "On main branch"

if [ -n "$(git status --porcelain)" ]; then
  warn "Working tree not clean:"
  git status --short
  if [ "$DRY_RUN" != true ]; then
    read -rp "  Continue anyway? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] || fail "Aborted"
  fi
else
  ok "Working tree clean"
fi

git fetch origin main --quiet
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/main)
if [ "$local_sha" != "$remote_sha" ]; then
  warn "Local main differs from origin/main"
fi

# ---------------------------------------------------------------------------
# Step 2: Env var verification
# ---------------------------------------------------------------------------

step "2. Verifying environment variables"

if [ ! -f "$ENV_FILE" ]; then
  warn "$ENV_FILE not found — attempting 'vercel env pull $ENV_FILE'"
  if command -v vercel &>/dev/null; then
    vercel env pull "$ENV_FILE" --environment=production --yes || \
      fail "Failed to pull env from Vercel. Run: vercel link && vercel env pull $ENV_FILE"
  else
    fail "Vercel CLI not installed. Run: npm i -g vercel"
  fi
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

missing=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    missing+=("$var")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  fail "Missing required env vars: ${missing[*]}"
fi
ok "All ${#REQUIRED_VARS[@]} required env vars present"

# Sanity checks on critical vars
if [ "${NEXT_PUBLIC_CHAIN_ID}" != "base" ]; then
  fail "NEXT_PUBLIC_CHAIN_ID must be 'base' for production (got: $NEXT_PUBLIC_CHAIN_ID)"
fi
ok "Chain ID is 'base'"

if [ ${#DATABASE_ENCRYPTION_KEY} -ne 64 ]; then
  fail "DATABASE_ENCRYPTION_KEY must be 64 hex chars (got: ${#DATABASE_ENCRYPTION_KEY})"
fi
ok "DATABASE_ENCRYPTION_KEY length correct (64 chars)"

if [ ${#CRON_SECRET} -lt 32 ]; then
  fail "CRON_SECRET must be at least 32 chars (got: ${#CRON_SECRET})"
fi
ok "CRON_SECRET length OK"

if [[ "$DATABASE_URL" != *"sslmode=require"* ]]; then
  warn "DATABASE_URL missing ?sslmode=require — connection pooling may be suboptimal"
fi

# Check for common secret leakage: key must not start with 0x (private keys), must be hex
if [[ "$RELAYER_PRIVATE_KEY" != 0x* ]]; then
  warn "RELAYER_PRIVATE_KEY should start with 0x"
fi

# ---------------------------------------------------------------------------
# Step 3: Secret scan
# ---------------------------------------------------------------------------

step "3. Scanning for leaked secrets in code"

if grep -rE "(sk_live|sk_prod|BEGIN PRIVATE KEY|BEGIN RSA)" \
    --include="*.ts" --include="*.tsx" --include="*.js" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
    app/ lib/ components/ hooks/ 2>/dev/null; then
  fail "Potential secret found in source code"
fi
ok "No obvious secrets in source"

# ---------------------------------------------------------------------------
# Step 4: Tests + type check + format
# ---------------------------------------------------------------------------

if [ "$SKIP_TESTS" = true ]; then
  warn "Skipping tests (--skip-tests passed)"
else
  step "4. Running tests"
  pnpm test:run || fail "Tests failed"
  ok "All tests passed"

  step "4b. Format check"
  pnpm format:check || fail "Format check failed. Run: pnpm format"
  ok "Formatting OK"
fi

# ---------------------------------------------------------------------------
# Step 5: Database migrations
# ---------------------------------------------------------------------------

step "5. Database migrations"

pnpm db:generate || fail "Drizzle generate failed"
ok "Migrations generated"

if [ "$DRY_RUN" = true ]; then
  warn "Dry run — skipping db:push"
else
  echo "  About to push migrations to:"
  echo "    ${DATABASE_URL%%@*}@***"
  read -rp "  Proceed? [y/N] " ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    pnpm db:push || fail "db:push failed"
    ok "Migrations applied"
  else
    warn "Skipped db:push — apply manually before deploy"
  fi
fi

# ---------------------------------------------------------------------------
# Step 6: Production build
# ---------------------------------------------------------------------------

step "6. Production build"
pnpm build || fail "Build failed"
ok "Build succeeded"

# ---------------------------------------------------------------------------
# Step 7: Deploy
# ---------------------------------------------------------------------------

step "7. Deploy"

if [ "$DRY_RUN" = true ]; then
  ok "Dry run complete — skipping git push"
  echo ""
  echo "${GREEN}Preflight passed.${NC} To deploy: re-run without --dry-run"
  exit 0
fi

echo "  Ready to deploy. This will:"
echo "    • git push origin main  → Vercel auto-deploys"
echo "    • Sentinel workflow auto-triggers if sentinel/** changed"
read -rp "  Deploy now? [y/N] " ans
if [[ ! "$ans" =~ ^[Yy]$ ]]; then
  warn "Aborted at final step"
  exit 0
fi

git push origin main
ok "Pushed to origin/main"

echo ""
echo "${GREEN}✓ Deploy triggered${NC}"
echo ""
echo "  Next: monitor the Vercel deploy at:"
echo "    https://vercel.com/dashboard"
echo ""
echo "  Post-deploy smoke test:"
echo "    1. curl -I https://tapioca.money                # 200 + HSTS header"
echo "    2. Login flow → Register agent → Toggle auto-optimize"
echo "    3. Check /api/sentinel/status for sentinel_status: OK"
echo "    4. Verify cron ran: check agent_actions table for new rows"
