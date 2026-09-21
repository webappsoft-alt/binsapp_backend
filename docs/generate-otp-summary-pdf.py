#!/usr/bin/env python3
"""Generate BinsApp OTP Security Summary PDF."""
from fpdf import FPDF

OUT = "/Users/danish/projects/binsAppbackend/docs/BinsApp-OTP-Security-Summary.pdf"

pdf = FPDF()
pdf.set_margins(15, 15, 15)
pdf.set_auto_page_break(auto=True, margin=15)
pdf.add_page()

W = pdf.w - pdf.l_margin - pdf.r_margin

pdf.set_font("Helvetica", "B", 18)
pdf.multi_cell(W, 10, "BinsApp OTP Security Summary")
pdf.set_font("Helvetica", "", 10)
pdf.set_text_color(100, 100, 100)
pdf.multi_cell(W, 6, "Backend changes (no frontend changes required)")
pdf.ln(4)
pdf.set_text_color(0, 0, 0)


def section(title):
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(37, 99, 235)
    pdf.multi_cell(W, 8, title)
    pdf.set_text_color(0, 0, 0)


def para(text):
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(W, 5, text)
    pdf.ln(1)


def bullet(text):
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(W, 5, f"  - {text}")


section("1. Twilio Error Handling")
para("Files: src/utils/sendOTP.js, src/modules/auth/service.js, src/utils/apiError.js")
bullet("Added parseTwilioError() with clear messages and hints for common Twilio codes.")
bullet("API errors include twilio object: httpStatus, code, message, moreInfo, hint.")
bullet("Logs no longer expose Twilio credentials in raw Axios error objects.")

section("2. Debug Logging")
para("File: src/modules/auth/controller.js")
bullet("Logs on send-otp: request context and failures (route, phone, user-agent, error details).")

section("3. OTP Abuse Protection")
para("Files: src/utils/otpProtection.js, src/middlewares/otpSendGuard.js")
bullet("Middleware on POST /api/auth/send-otp - runs before Twilio is called.")
bullet("Same API contract; frontend flow unchanged.")
para("Controls:")
for line in [
    "  Per phone: 3 / 24h - Stop same number spam",
    "  Per phone cooldown: 90 sec - Stop rapid resends",
    "  Per IP: 8 / hour - Stop scripts from one IP",
    "  Distinct phones per IP: 5 / hour - Stop SMS pumping pattern",
    "  Global daily cap: 100 / day - Financial fuse (max SMS/day)",
    "  IP auto-block: 24 hours - Block abusive IPs after flood",
]:
    para(line)

section("4. Region Rules")
para("Files: src/utils/otpProtection.js, src/config/env.js")
bullet("US (+1): all numbers allowed (with rate limits above).")
bullet("Pakistan (+92): only whitelist allowed; all other +92 numbers blocked.")
para("Pakistan whitelist (test numbers):")
for num in [
    "+923467893622",
    "+923117384180",
    "+923703839371",
    "+923006918515",
    "+923186159112",
]:
    bullet(num)
para('Blocked regions/numbers get: "Phone number region is not supported".')

section("Environment Variables (Set on Server)")
pdf.set_font("Courier", "", 8)
for line in [
    "OTP_PROTECTION_ENABLED=true",
    "OTP_PHONE_MAX_PER_DAY=3",
    "OTP_PHONE_COOLDOWN_SEC=90",
    "OTP_IP_MAX_PER_HOUR=8",
    "OTP_IP_DISTINCT_PHONES_MAX=5",
    "OTP_GLOBAL_DAILY_MAX=100",
    "OTP_ALLOWED_PREFIXES=+1",
    "OTP_PK_WHITELIST=+923467893622,+923117384180,+923703839371,+923006918515,+923186159112",
    "OTP_IP_BLOCK_HOURS=24",
]:
    pdf.multi_cell(W, 4, line)
pdf.ln(2)
para("Important: If server .env has OTP_ALLOWED_PREFIXES=+1,+92, remove +92 or Pakistan whitelist won't work.")

section("Twilio Console Actions (Manual, No Code)")
for item in [
    "Disable auto-recharge - Billing > Payment settings > Auto-recharge OFF.",
    "Keep low manual balance only (e.g. $20-50) - when balance = $0, SMS stops.",
    "Enable Verify Fraud Guard on your Verify Service.",
    "Restrict Geo permissions to US (and PK only if needed for test numbers).",
    "Set usage alerts (Usage Triggers) for early warning.",
    "Rotate Auth Token if it was ever exposed in logs.",
]:
    bullet(item)

section("Files Touched")
for f, c in [
    ("src/utils/sendOTP.js", "Twilio error parsing, safer logging"),
    ("src/modules/auth/service.js", "Twilio error throwing, lookup auth errors"),
    ("src/utils/apiError.js", "twilio field in error responses"),
    ("src/modules/auth/controller.js", "send-otp debug logs"),
    ("src/utils/otpProtection.js", "Rate limits, region rules, PK whitelist"),
    ("src/middlewares/otpSendGuard.js", "Middleware wrapper"),
    ("src/modules/auth/routes.js", "otpSendGuard on send-otp"),
    ("src/config/env.js", "OTP protection config"),
]:
    para(f"{f}: {c}")

section("Log Messages to Watch")
for log, meaning in [
    ("otp.protection.allowed", "OTP request passed checks"),
    ("otp.protection.region_blocked", "Blocked country/number"),
    ("otp.protection.blocked", "Rate limit hit"),
    ("otp.protection.ip_blocked", "IP auto-blocked"),
    ("otp.protection.global_daily_cap_reached", "Daily SMS cap hit"),
    ("auth.send-otp.failure", "send-otp failed"),
]:
    para(f"{log} -> {meaning}")

section("How Protection Layers Work")
pdf.set_font("Courier", "", 9)
pdf.multi_cell(
    W,
    5,
    "Request -> Rate limits -> Region check (+1 open, +92 whitelist only)\n"
    "       -> If OK -> Twilio send OTP\n"
    "       -> If cap/limit hit -> Error (no Twilio call, no charge)",
)
pdf.ln(2)
para("Max theoretical OTP spend = OTP_GLOBAL_DAILY_MAX x cost per SMS")
para("(e.g. 100 x ~$0.05 = ~$5/day)")

pdf.output(OUT)
print(f"PDF created: {OUT}")
