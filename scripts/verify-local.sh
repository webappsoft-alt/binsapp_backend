#!/bin/bash
# Run from your laptop to test api.binsapp.ai (no SSH needed)
# Usage: bash scripts/verify-local.sh

API="https://api.binsapp.ai/api/auth/send-otp"

echo "Test 1: Static number (should succeed with code 1234, no Twilio)"
curl -s -X POST "$API" \
  -H "Content-Type: application/json" \
  -H "User-Agent: BinsApp/1.0" \
  -d '{"phone":"+923117384180"}' | python3 -m json.tool 2>/dev/null || curl -s -X POST "$API" -H "Content-Type: application/json" -H "User-Agent: BinsApp/1.0" -d '{"phone":"+923117384180"}'

echo ""
echo "---"
echo "Check the response:"
echo "  • success:true + code:1234     → NEW code deployed, static bypass works"
echo "  • [object Object] + binsAppDevlopment in stack → OLD app still live"
echo "  • Twilio error 20003           → NEW code live, fix Twilio .env on server"
echo "  • OTP limit exceeded           → Redis limits; clear keys on server"
