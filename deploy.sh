#!/bin/bash

# Deploy binsApp backend to production VPS.
# api.binsapp.ai runs from /root/binsAppNew

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

VPS_HOST="88.223.92.251"
VPS_USER="root"
REMOTE_DIR="${REMOTE_DIR:-/root/binsAppNew}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-new_flow_uber}"
PM2_APP_NAME="${PM2_APP_NAME:-bins-api}"
GIT_REPO="git@github.com:arslan0044/binsApp.git"
# Static test number that must always return success:true (code 1234) when the
# NEW code is truly live. Used as the post-deploy smoke test.
SMOKE_PHONE="${SMOKE_PHONE:-+923467893622}"
API_URL="${API_URL:-https://api.binsapp.ai/api/auth/send-otp}"

if [[ -n $(git status -s) ]]; then
  echo -e "${YELLOW}Warning: uncommitted changes.${NC}"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Aborted.${NC}"
    exit 1
  fi
fi

CURRENT_BRANCH=$(git branch --show-current)
echo -e "${GREEN}Pushing ${CURRENT_BRANCH} to origin...${NC}"
git push origin "${CURRENT_BRANCH}"

echo -e "${GREEN}Deploying branch ${DEPLOY_BRANCH} to ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}${NC}"
ssh "${VPS_USER}@${VPS_HOST}" << EOF
  set -e
  echo "=== Deploy started at \$(date) ==="

  # Non-interactive SSH shells don't load nvm/profile, so node/yarn/npm/pm2 may
  # not be on PATH (this is why 'yarn: command not found' aborted the last run).
  # Bootstrap the PATH from the usual locations before doing anything.
  export NVM_DIR="\$HOME/.nvm"
  [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
  export PATH="\$PATH:/usr/local/bin:/usr/bin:\$HOME/.local/bin:\$HOME/.yarn/bin:\$HOME/.npm-global/bin"
  echo "node: \$(command -v node || echo MISSING)  pm2: \$(command -v pm2 || echo MISSING)"

  if [ ! -d "${REMOTE_DIR}" ]; then
    mkdir -p ${REMOTE_DIR}
    cd ${REMOTE_DIR}
    git clone ${GIT_REPO} .
  else
    cd ${REMOTE_DIR}
  fi

  git fetch --all
  git checkout ${DEPLOY_BRANCH}
  git reset --hard origin/${DEPLOY_BRANCH}

  echo "Deployed commit:"
  git log -1 --oneline

  echo "Static-number list in deployed code (must contain ${SMOKE_PHONE}):"
  if grep -q "${SMOKE_PHONE}" src/utils/staticOtpPhones.js; then
    echo "  OK: ${SMOKE_PHONE} present in staticOtpPhones.js"
  else
    echo "  ERROR: ${SMOKE_PHONE} NOT in staticOtpPhones.js — wrong branch/folder!"
    exit 2
  fi

  # Install deps with whatever package manager exists. Never let this abort the
  # restart — a failed/absent installer must not keep the old crashing code live.
  if command -v yarn >/dev/null 2>&1; then
    echo "Installing deps with yarn..."
    yarn install --frozen-lockfile 2>/dev/null || yarn install || true
  elif command -v npm >/dev/null 2>&1; then
    echo "Installing deps with npm..."
    npm ci 2>/dev/null || npm install || true
  else
    echo "No yarn/npm on PATH — skipping install (this deploy has no dep changes)."
  fi

  # Clear stale OTP limits/blocks from testing (safe: only otp:* keys).
  if command -v redis-cli >/dev/null 2>&1; then
    echo "Clearing Redis otp:* keys (limits + IP blocks)..."
    redis-cli --scan --pattern 'otp:*' | xargs -r redis-cli del || true
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    echo "ERROR: pm2 not found on PATH even after nvm bootstrap."
    echo "Run 'which pm2' in an interactive SSH session and add that dir to PATH in deploy.sh."
    exit 3
  fi

  echo "PM2 state before restart:"
  pm2 list || true

  # Force PM2 to run THIS folder. Restarting a stale numeric id can silently
  # keep serving the wrong cwd, so we delete any existing app of this name and
  # start fresh with an explicit --cwd.
  pm2 delete ${PM2_APP_NAME} 2>/dev/null || true
  pm2 start src/server.js --name ${PM2_APP_NAME} --cwd ${REMOTE_DIR}
  pm2 save

  echo "PM2 state after restart (exec cwd MUST be ${REMOTE_DIR}):"
  pm2 describe ${PM2_APP_NAME} 2>/dev/null | grep -E 'name|status|script path|exec cwd' || true

  echo "=== Deploy finished at \$(date) ==="
EOF

DEPLOY_STATUS=$?
if [ $DEPLOY_STATUS -ne 0 ]; then
  echo -e "${RED}Deploy failed (exit ${DEPLOY_STATUS}).${NC}"
  exit 1
fi

# --- Post-deploy smoke test against the LIVE public API ---
echo -e "${GREEN}Verifying live API with static number ${SMOKE_PHONE}...${NC}"
sleep 3
RESP=$(curl -s -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -H "User-Agent: BinsApp/1.0" \
  -d "{\"phone\":\"${SMOKE_PHONE}\"}")
echo "Response: ${RESP}"

if echo "$RESP" | grep -q '"success":true'; then
  echo -e "${GREEN}Deploy OK — new code is LIVE and static bypass works.${NC}"
else
  echo -e "${RED}Deploy pushed but LIVE API did not accept the static number.${NC}"
  echo -e "${YELLOW}This means the running process is NOT this folder/commit.${NC}"
  echo -e "${YELLOW}Check: pm2 describe ${PM2_APP_NAME} | grep 'exec cwd' — it must be ${REMOTE_DIR}.${NC}"
  echo -e "${YELLOW}Also confirm nginx for api.binsapp.ai proxies to this process's port.${NC}"
  exit 1
fi
