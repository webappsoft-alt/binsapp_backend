#!/bin/bash
# Run this ON THE SERVER (ssh root@88.223.92.251) to find why send-otp still fails.
# Usage: bash verify-server.sh

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
warn() { echo -e "${YELLOW}! WARN${NC}: $1"; }

echo "=========================================="
echo "  BinsApp send-otp production verification"
echo "=========================================="
echo ""

# --- STEP 1: Which folder is PM2 actually running? ---
echo "STEP 1 — Which app serves api.binsapp.ai?"
echo "------------------------------------------"
if ! command -v pm2 &>/dev/null; then
  fail "pm2 not installed"
else
  pm2 list
  echo ""
  for id in $(pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{JSON.parse(d).forEach(p=>console.log(p.pm_id))}catch{}})" 2>/dev/null); do
    echo "--- pm2 describe $id ---"
    pm2 describe "$id" 2>/dev/null | grep -E 'name|status|script path|exec cwd|error log|out log' || true
    echo ""
  done
fi

echo ""
echo "STEP 2 — Code version in each folder"
echo "------------------------------------------"
for DIR in /root/binsAppNew /root/binsAppDevlopment /root/binsApp; do
  if [ -d "$DIR" ]; then
    echo ">> $DIR"
    cd "$DIR"
    git log -1 --oneline 2>/dev/null || echo "  (not a git repo)"
    git branch --show-current 2>/dev/null || true
    if [ -f src/modules/auth/service.js ]; then
      if grep -q "toErrorMessage" src/modules/auth/service.js 2>/dev/null; then
        pass "  service.js has NEW error handling (toErrorMessage)"
      else
        fail "  service.js is OLD code (no toErrorMessage)"
      fi
      if grep -q "isStaticOtpPhone" src/modules/auth/service.js 2>/dev/null; then
        pass "  service.js has static OTP bypass"
      else
        fail "  service.js missing static OTP bypass"
      fi
      echo "  sendOtp starts at line: $(grep -n 'export async function sendOtp' src/modules/auth/service.js | head -1)"
    else
      warn "  no src/modules/auth/service.js"
    fi
    echo ""
  else
    warn "$DIR does not exist"
  fi
done

echo ""
echo "STEP 3 — Twilio credentials on server"
echo "------------------------------------------"
# Use binsAppNew .env first, fall back to binsAppDevlopment
ENV_FILE=""
for f in /root/binsAppNew/.env /root/binsAppDevlopment/.env; do
  if [ -f "$f" ]; then
    ENV_FILE="$f"
    break
  fi
done

if [ -z "$ENV_FILE" ]; then
  fail "No .env found in binsAppNew or binsAppDevlopment"
else
  echo "Using: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  if [ -z "$TWILIO_ACCOUNT_SID" ]; then fail "TWILIO_ACCOUNT_SID is empty"; else pass "TWILIO_ACCOUNT_SID set (${TWILIO_ACCOUNT_SID:0:6}...)"; fi
  if [ -z "$TWILIO_AUTH_TOKEN" ]; then fail "TWILIO_AUTH_TOKEN is empty"; else pass "TWILIO_AUTH_TOKEN set"; fi
  if [ -z "$TWILIO_SERVICE_SID" ]; then fail "TWILIO_SERVICE_SID is empty"; else pass "TWILIO_SERVICE_SID set (${TWILIO_SERVICE_SID:0:6}...)"; fi

  echo ""
  echo "Testing Twilio API..."
  HTTP_CODE=$(curl -s -o /tmp/twilio_test.json -w "%{http_code}" \
    -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
    "https://verify.twilio.com/v2/Services/$TWILIO_SERVICE_SID")
  echo "Twilio HTTP status: $HTTP_CODE"
  cat /tmp/twilio_test.json
  echo ""
  if [ "$HTTP_CODE" = "200" ]; then
    pass "Twilio credentials are VALID"
  elif [ "$HTTP_CODE" = "401" ]; then
    fail "Twilio credentials INVALID (401 Authenticate) — regenerate Auth Token in Twilio Console"
  else
    warn "Unexpected Twilio response $HTTP_CODE"
  fi
fi

echo ""
echo "STEP 4 — Live API test (what api.binsapp.ai returns)"
echo "------------------------------------------"
RESP=$(curl -s -X POST "https://api.binsapp.ai/api/auth/send-otp" \
  -H "Content-Type: application/json" \
  -H "User-Agent: BinsApp/1.0" \
  -d '{"phone":"+923117384180"}')
echo "$RESP" | head -c 800
echo ""

if echo "$RESP" | grep -q 'binsAppDevlopment'; then
  fail "API still running OLD folder: binsAppDevlopment (not binsAppNew)"
  echo "  → Fix: pm2 must restart the app whose exec cwd is /root/binsAppNew"
elif echo "$RESP" | grep -q '\[object Object\]'; then
  fail "API still returns [object Object] — old error code is live"
elif echo "$RESP" | grep -q '"success":true'; then
  pass "Static test number works — OTP sent"
elif echo "$RESP" | grep -q 'Twilio error 20003'; then
  warn "New code is live but Twilio credentials still wrong — fix .env"
else
  warn "Unexpected response — check above"
fi

echo ""
echo "STEP 5 — Which process listens on port 8000 (or your app port)?"
echo "------------------------------------------"
ss -tlnp 2>/dev/null | grep -E '8000|3000|5000' || netstat -tlnp 2>/dev/null | grep -E '8000|3000|5000' || warn "Could not detect listening port"

echo ""
echo "=========================================="
echo "  SUMMARY — what to fix"
echo "=========================================="
echo "1. If stack trace says binsAppDevlopment → PM2 is NOT using binsAppNew."
echo "   Run: cd /root/binsAppNew && git pull && pm2 delete 2; pm2 start src/server.js --name bins-api --cwd /root/binsAppNew && pm2 save"
echo ""
echo "2. If Twilio returns 401 → update TWILIO_AUTH_TOKEN in .env and pm2 restart."
echo ""
echo "3. Static number +923117384180 should return success:true with code 1234 (no Twilio)."
echo "=========================================="
