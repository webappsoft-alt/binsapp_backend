import convict from "convict";
import dotenv from "dotenv";
import { format } from "morgan";

dotenv.config(); // Load .env variables

const config = convict({
  env: {
    doc: "The application environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV",
  },
  port: {
    doc: "The port the server runs on",
    format: "port",
    default: 8000,
    env: "PORT",
  },
  appSecret: {
    format: String,
    default: "$2a$12$52p0Q2jiVrBK6DYGlQOa/.yM2RncNdU2xfHl4KRHoPU1Zu3EhiJnO",
    env: "APP_SECRET",
  },
  databaseUrl: {
    doc: "Database connection URL",
    format: String,
    default: "",
    env: "DATABASE_URL",
  },
  jwtSecret: {
    doc: "JWT Secret Key for Access Token",
    format: String,
    default: "your_jwt_secret",
    env: "JWT_SECRET",
    sensitive: true,
  },
  refreshSecret: {
    doc: "JWT Secret Key for Refresh Token",
    format: String,
    default: "your_refresh_secret",
    env: "REFRESH_SECRET",
    sensitive: true,
  },
  jwtAccessExpiration: {
    doc: "JWT Access Token Expiration Time in milliseconds",
    format: Number,
    default: 1000 * 60 * 60 * 24 * 7 * 365, // 15 minutes in milliseconds
    env: "JWT_ACCESS_EXPIRATION",
  },
  jwtRefreshExpiration: {
    doc: "JWT Refresh Token Expiration Time in milliseconds",
    format: Number,
    default: 604800000,
    env: "JWT_REFRESH_EXPIRATION",
  },
  jwtIDPrivateKey: {
    doc: "JWT ID Private Key",
    format: String,
    default: "your_jwt_id_private_key",
    env: "JWT_ID_PRIVATE_KEY",
    sensitive: true,
  },
  jwtIssuer: {
    doc: "JWT Issuer",
    format: String,
    default: "your_jwt_issuer",
    env: "JWT_ISSUER",
  },
  jwtAudience: {
    doc: "JWT Audience",
    format: String,
    default: "your_jwt_audience",
    env: "JWT_AUDIENCE",
  },
  redisUrl: {
    doc: "Redis connection URL",
    format: String,
    default: "redis://127.0.0.1:6379",
    env: "REDIS_URL",
  },
  frontendUrl: {
    doc: "Frontend URL",
    format: String,
    default: "http://localhost:3000",
    env: "FRONTEND_URL",
  },
  googleClientId: {
    doc: "Google Client ID",
    format: String,
    default:
      "1073930846177-docvkc3l97sa6didhrrrr7jkr07302vq.apps.googleusercontent.com",
    env: "GOOGLE_CLIENT_ID",
  },
  googleClientSecret: {
    doc: "Google Client Secret",
    format: String,
    default: "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",
    env: "GOOGLE_CLIENT_SECRET",
    sensitive: true,
  },
  googleCallbackURL: {
    doc: "Google OAuth callback URL",
    format: String,
    default: "http://localhost:3000/api/auth/google/callback",
    env: "GOOGLE_CALLBACK_URL",
  },
  email: {
    host: {
      doc: "Email SMTP host",
      format: String,
      default: "smtp.ethereal.email",
      env: "MAIL_HOST",
    },
    port: {
      doc: "Email SMTP port",
      format: "port",
      default: 2525,
      env: "MAIL_PORT",
    },
    secure: {
      doc: "Email SMTP secure connection",
      format: Boolean,
      default: false,
      env: "EMAIL_SECURE",
    },
    user: {
      doc: "Email SMTP user",
      format: String,
      default: "",
      env: "MAIL_USER",
    },
    pass: {
      doc: "Email SMTP password",
      format: String,
      default: "",
      env: "MAIL_PASS",
      sensitive: true,
    },
  },
  casbin: {
    policyVersion: "1.0.0",
    reloadInterval: 300000, // 5 minutes
    defaultRole: "guest",
    requiredPolicies: [
      { role: "admin", resource: "*", action: "*" },
      { role: "user", resource: "profile", action: "read" },
    ],
  },
  mongodb: {
    doc: "MongoDB connection URL",
    format: String,
    default: "",
    env: "MONGODB_URI",
  },
  sessionSecrate: {
    default: "your_session_secret",
    doc: "Session secret key",
    format: String,
    env: "SESSION_SECRET",
  },
  frontendSuccessUrl: {
    doc: "Frontend success URL",
    format: String,
    default: "http://localhost:3000/",
    env: "FRONTEND_SUCCESS_URL",
  },
  login: {
    maxAttempts: {
      doc: "Max login attempts",
      format: Number,
      default: 5,
      env: "LOGIN_MAX_ATTEMPTS",
    },
    banTime: {
      doc: "Lock time in milliseconds",
      format: Number,
      default: 300, // 1 minute
      env: "LOGIN_LOCK_TIME",
    },
  },
  firebase: {
    type: {
      doc: "Firebase service type",
      format: String,
      default: "",
      env: "FIREBASE_PROJECT_TYPE",
    },
    projectId: {
      doc: "Firebase project ID",
      format: String,
      default: "",
      env: "FIREBASE_PROJECT_ID",
    },
    privateKeyId: {
      doc: "Firebase private key ID",
      format: String,
      default: "",
      env: "FIREBASE_PRIVATE_KEY_ID",
      sensitive: true,
    },
    privateKey: {
      doc: "Firebase private key",
      format: String,
      default: "",
      env: "FIREBASE_PRIVATE_KEY",
      sensitive: true,
    },
    clientEmail: {
      doc: "Firebase client email",
      format: String,
      default: "",
      env: "FIREBASE_CLIENT_EMAIL",
    },
    clientId: {
      doc: "Firebase client ID",
      format: String,
      default: "",
      env: "FIREBASE_CLIENT_ID",
      sensitive: true,
    },
    authURI: {
      doc: "OAuth2 auth URI",
      format: String,
      default: "",
      env: "FIREBASE_AUTH_URI",
    },
    tokenURI: {
      doc: "OAuth2 token URI",
      format: String,
      default: "",
      env: "FIREBASE_TOKEN_URI",
    },
    authProviderCertURL: {
      doc: "OAuth2 provider cert URL",
      format: String,
      default: "",
      env: "FIREBASE_AUTH_PROVIDER_CERT_URL",
    },
    clientCertURL: {
      doc: "Firebase client cert URL",
      format: String,
      default: "",
      env: "FIREBASE_CLIENT_CERT_URL",
    },
    universeDomain: {
      doc: "Google API universe domain",
      format: String,
      default: "",
      env: "FIREBASE_UNIVERSE_DOMAIN",
    },
  },
  appinfo: {
    name: {
      doc: "Application Name",
      format: String,
      env: "APP_NAME",
      default: "Backend",
    },
    description: {
      doc: "Application Description",
      format: String,
      env: "APP_DESCRIPTION",
      default: "Backend",
    },
    supportEmail: {
      doc: "Application Support Email",
      format: String,
      env: "APP_SUPPORT_EMAIL",
      default: "admin@backend.com",
    },
    backendURL: {
      doc: "Application Support Email",
      format: String,
      env: "APP_BACKEND_DOMAIN",
      default: "https://api.backend.com",
    },
  },
  otpProtection: {
    enabled: {
      doc: "Enable Redis-backed OTP abuse protection on send-otp",
      format: Boolean,
      default: true,
      env: "OTP_PROTECTION_ENABLED",
    },
    phoneMaxPerDay: {
      doc: "Max OTP sends per phone number per 24 hours",
      format: Number,
      default: 20,
      env: "OTP_PHONE_MAX_PER_DAY",
    },
    phoneCooldownSec: {
      doc: "Minimum seconds between OTP sends to the same phone",
      format: Number,
      default: 30,
      env: "OTP_PHONE_COOLDOWN_SEC",
    },
    ipLimitsEnabled: {
      // OFF by default: behind a proxy/LB or CGNAT the real client IP is often
      // not propagated, so per-IP checks collapse all users into one bucket and
      // wrongly block legitimate users. Only turn on once X-Forwarded-For and
      // `trust proxy` are verified to yield real client IPs.
      doc: "Enable per-IP OTP throttling (requires reliable client IP behind proxies)",
      format: Boolean,
      default: false,
      env: "OTP_IP_LIMITS_ENABLED",
    },
    ipMaxPerHour: {
      // Kept high because mobile carriers (CGNAT) route many legitimate users
      // through a few shared public IPs. This is a self-healing hourly window,
      // not a persistent ban. Per-phone limits are the primary abuse control.
      doc: "Max OTP sends per IP address per hour (self-healing window)",
      format: Number,
      default: 300,
      env: "OTP_IP_MAX_PER_HOUR",
    },
    ipDistinctPhonesMax: {
      doc: "Max different phone numbers one IP can request OTP for per hour (CGNAT-tolerant)",
      format: Number,
      default: 150,
      env: "OTP_IP_DISTINCT_PHONES_MAX",
    },
    globalDailyMax: {
      doc: "Hard daily cap on all OTP sends (UTC day). Set 0 to disable.",
      format: Number,
      default: 500,
      env: "OTP_GLOBAL_DAILY_MAX",
    },
    allowedPrefixes: {
      doc: "Open E.164 prefixes for OTP (comma-separated, e.g. +1,+92). Numbers matching these prefixes receive real OTPs; the pkWhitelist is only a fallback for +92 when +92 is not listed here.",
      format: String,
      default: "+1,+92",
      env: "OTP_ALLOWED_PREFIXES",
    },
    pkWhitelist: {
      doc: "Comma-separated +92 numbers allowed for OTP testing; all other Pakistan numbers are blocked",
      format: String,
      default:
        "+923467893622,+923117384180,+923394013218,+923703839371,+923006918515,+923186159112",
      env: "OTP_PK_WHITELIST",
    },
  },
  twilio: {
    accountSid: {
      doc: "Twilio Account SID",
      format: String,
      env: "TWILIO_ACCOUNT_SID",
      default: "",
    },
    authToken: {
      doc: "Twilio Auth Token",
      format: String,
      env: "TWILIO_AUTH_TOKEN",
      default: "",
    },
    serviceSid: {
      doc: "Twilio Service SID",
      format: String,
      env: "TWILIO_SERVICE_SID",
      default: "",
    },
    appHash: {
      doc: "Twilio App Hash",
      format: String,
      env: "TWILIO_APP_HASH",
      default: "",
    },
  },
  stripe: {
    secretKey: {
      doc: "Stripe Secret Key",
      format: String,
      sensitive: true,
      env: "STRIPE_SECRET_KEY",
      default: "",
    },
    publishableKey: {
      doc: "Stripe Publishable Key",
      format: String,
      sensitive: true,
      env: "STRIPE_PUBLISHABLE_KEY",
      default: "",
    },
    webhookSecret: {
      doc: "Stripe Webhook Signing Secret",
      format: String,
      sensitive: true,
      env: "STRIPE_WEBHOOK_SECRET",
      default: "",
    },
  },
  redirectUrl: {
    doc: "Redirect URL",
    format: String,
    default: "http://localhost:3000",
    env: "REDIRECT_URL",
  },
  redirectFrontendUrl: {
    doc: "Redirect URL",
    format: String,
    default: "http://localhost:3000",
    env: "REDIRECT_FRONTEND_URL",
  },
  OpenAIApiKey: {
    doc: "OpenAI API Key",
    format: String,
    env: "AI_ASSESSMENT_API_KEY",
    default: "",
    sensitive: true,
  },
  isTaxApplicable: {
    doc: "Tax Applicable",
    format: Boolean,
    env: "IS_TAX_APPLICABLE",
    default: false,
  },
});

// Perform validation
config.validate({ allowed: "strict" });

export default config;
