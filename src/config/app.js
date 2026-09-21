import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import logger, { httpLogger } from "./logger.js";
import redis from "./redis.js";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { connectMongoDB } from "./mongodb.js";
import mongoose from "mongoose";
import session from "express-session";
import config from "./env.js";
import routes from "../modules/index.js";
import admin from "./firebase.js";
import dns from "node:dns";
// // import prisma, { connectDB as connectPostgres } from "./database.js";
// // import { errorHandler } from "../middlewares/errorHandler.js";
// // import initializePassport from "./passport.js";
// // import passport from "passport";
// // import { initializeCasbin } from "../config/casbin.js";
// // import { swaggerDocs } from "./swagger.js";
// // import { setupWebSocket, getIO } from "../websocket/index.js";
// // import { createServer } from "http";
// import { sessionMiddleware } from "./session.js";
import { cronjobs } from "../utils/cronjobs.js";
import { ApiError, BadRequestError } from "../utils/apiError.js";
import {
  toErrorMessage,
  twilioFieldsFromUnknown,
} from "../utils/errorMessage.js";
import { swaggerDocs } from "./swagger.js";
import { stripeWebhookController } from "../modules/payment/webhookController.js";
import { registerAccountDeletionRoutes } from "./accountDeletionRoutes.js";
const app = express();
// // const server = createServer(app);
app.use(express.static("public"));
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// // ========================
// // Security Middleware
// // ========================
admin;
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://*.valid-cdn.com"],
        connectSrc: ["'self'", "https://*.valid-api.com"],
      },
    },
  }),
);

// app.set('trust proxy', true);
app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);
app.set("trust proxy", 1);
// // ========================
// // Session Middleware
// // =========================
// app.use(sessionMiddleware);
app.use(
  session({
    secret:
      config.get("sessionSecrate") || crypto.randomBytes(64).toString("hex"),
    resave: false,
    saveUninitialized: false, // Changed for GDPR compliance
    store:
      config.get("env") === "production"
        ? new RedisStore({ client: redisClient })
        : null,
    cookie: {
      secure: false,
      secure: config.get("env") === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// // ========================
// // CORS Configuration
// // ========================
// // temprarily disabled for local development
app.use(
  cors({
    origin: "*", // Update for production security
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: false,
  }),
);
// app.options("*", cors());
// //
// //=====================================
// // Initialize Casbin on startup
// //======================================
// // initializeCasbin();
// // ========================
// // Passport Middleware
// // ========================
// // initializePassport(passport);
// // app.use(passport.initialize());
// // app.use(passport.session());
// // Setup WebSocket
// // setupWebSocket(server);
// // ========================
// // Rate Limiting
// // ========================
app.use(
  rateLimit({
    validate: {
      validationsConfig: false,
      default: true,
    },
    windowMs: 1 * 60 * 1000, // 15 minutes
    max: 100000, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
  }),
);

// // ========================
// // Request Parsing
// // ========================
app.use(cookieParser());

// Stripe webhook must receive raw body for signature verification
app.post(
  "/api/payment/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookController,
);

app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "1gb" }));
app.use(bodyParser.urlencoded({ limit: "1gb", extended: true }));
// Custom error handler for JSON parse failures
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      code: "INVALID_JSON",
      message: "Malformed JSON. Please fix your syntax.",
      example: {
        correctFormat: {
          email: "user@example.com",
          password: "yourPassword123",
        },
      },
    });
  }
  next(err); // Pass to next error handler
});

// // ========================
// // Logging
// // ========================
app.use(httpLogger);

// // ========================
// // Database Connections
// // ========================

// await connectPostgres();
await connectMongoDB();

cronjobs();

// // ========================
// // Enhanced Health Check
// // ========================
app.get("/", async (req, res) => {
  const healthCheck = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      // postgresql: "unhealthy",
      mongodb: "unhealthy",
      redis: "unhealthy",
    },
  };

  // try {
  //   // PostgreSQL Check
  //   await prisma.$queryRaw`SELECT 1`;
  //   healthCheck.services.postgresql = "healthy";
  // } catch (error) {
  //   healthCheck.status = "degraded";
  //   logger.error("PostgreSQL health check failed:", error);
  // }

  try {
    if (mongoose.connection.readyState === 1) {
      healthCheck.services.mongodb = "healthy";
    } else {
      healthCheck.status = "degraded";
      logger.error("MongoDB is not connected properly.");
    }
  } catch (error) {
    healthCheck.status = "degraded";
    logger.error("MongoDB health check failed:", error);
  }

  // Redis Check
  try {
    const redisPing = await redis.ping();
    healthCheck.services.redis = redisPing === "PONG" ? "healthy" : "unhealthy";
  } catch (error) {
    healthCheck.status = "degraded";
    logger.error("Redis health check failed:", error);
  }

  // Determine overall status
  if (Object.values(healthCheck.services).every((s) => s === "healthy")) {
    healthCheck.status = "ok";
  } else if (
    Object.values(healthCheck.services).some((s) => s === "unhealthy")
  ) {
    healthCheck.status = "degraded";
  }

  res.status(healthCheck.status === "ok" ? 200 : 503).json(healthCheck);
});
app.get("/.well-known/assetlinks.json", (req, res) => {
  res.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.binsdumpsterrentals.app",
        sha256_cert_fingerprints: [
          "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C",
          "46:DC:99:F6:BE:F4:89:FF:B7:D2:EF:96:67:10:AE:1C:42:4E:A8:EF:B5:84:D2:3F:18:CA:B5:D1:92:4A:E2:28",
        ],
      },
    },
  ]);
});

app.get("/.well-known/apple-app-site-association", (req, res) => {
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "22JTH5NLMK.com.binsdumpsterrentals.app",
          paths: ["*"],
        },
      ],
    },
  });
});

// Legal pages live on the marketing site; keep api.binsapp.ai/* URLs working (Play Store, old links).
const MARKETING_SITE = "https://www.binsapp.ai";
app.get("/privac", (req, res) => {
  res.redirect(301, `${MARKETING_SITE}/privacy`);
});
app.get("/privacy", (req, res) => {
  res.redirect(301, `${MARKETING_SITE}/privacy`);
});
registerAccountDeletionRoutes(app);
app.get("/terms", (req, res) => {
  res.redirect(301, `${MARKETING_SITE}/terms`);
});
app.get("/operator-agreement", (req, res) => {
  res.redirect(301, `${MARKETING_SITE}/operator-agreement`);
});

app.get("/assign-driver", async (req, res) => {
  if (req.query.token) {
    return res.redirect(
      `${config.get("redirectFrontendUrl")}/assign-driver?${req.query.token}`,
    );
  }
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BinsApp | Assign Driver</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-green: #22C55E;
            --black: #0F172A;
            --white: #FFFFFF;
            --gray-light: #F8FAFC;
        }

        body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: var(--gray-light);
            font-family: 'Inter', sans-serif;
            color: var(--black);
            overflow: hidden;
        }

        /* Abstract background shapes */
        .bg-shape {
            position: absolute;
            z-index: -1;
            filter: blur(80px);
            opacity: 0.2;
            border-radius: 50%;
        }

        .shape-1 {
            width: 300px;
            height: 300px;
            background-color: var(--primary-green);
            top: -100px;
            right: -50px;
        }

        .shape-2 {
            width: 400px;
            height: 400px;
            background-color: var(--black);
            bottom: -150px;
            left: -100px;
        }

        .container {
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 3rem;
            border-radius: 2rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
            transform: translateY(20px);
            opacity: 0;
            animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideUp {
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .logo {
            font-weight: 800;
            font-size: 1.5rem;
            letter-spacing: -0.05em;
            margin-bottom: 2rem;
            display: inline-block;
        }

        .logo span {
            color: var(--primary-green);
        }

        h1 {
            font-weight: 800;
            font-size: 2rem;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
        }

        p {
            color: #64748B;
            line-height: 1.6;
            margin-bottom: 2.5rem;
        }

        .download-btn {
            background-color: var(--black);
            color: var(--white);
            padding: 1.25rem 2.5rem;
            border-radius: 1rem;
            font-weight: 600;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 2px solid transparent;
            box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.3);
        }

        .download-btn:hover {
            background-color: var(--primary-green);
            transform: translateY(-2px);
            box-shadow: 0 20px 25px -5px rgba(34, 197, 94, 0.4);
        }

        .download-btn:active {
            transform: translateY(0);
        }

        .download-btn svg {
            width: 20px;
            height: 20px;
            transition: transform 0.3s ease;
        }

        .download-btn:hover svg {
            transform: translateY(2px);
        }

        .footer {
            margin-top: 2rem;
            font-size: 0.875rem;
            color: #94A3B8;
        }
    </style>
</head>
<body>
    <div class="bg-shape shape-1"></div>
    <div class="bg-shape shape-2"></div>

    <div class="container">
        <div class="logo">Bins<span>App</span></div>
        <h1>Ready to Roll?</h1>
        <p>Your task is waiting. Download the app now to assign the driver and start your journey.</p>
        
        <a href="https://www.binsapp.ai/" class="download-btn">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 7.5 12 12m0 0 4.5-4.5M12 12V3" />
            </svg>
            Download App
        </a>

        <div class="footer">
            &copy; 2024 BinsApp Inc.
        </div>
    </div>
</body>
</html>
  `);
});
// // ========================
// // Application Routes
// // ========================
app.use((req, res, next) => {
  const userAgent = req.headers["user-agent"];
  if (
    !userAgent ||
    userAgent.includes("axios") ||
    userAgent.includes("python-requests")
  ) {
    logger.error("Bot traffic detected", userAgent);
    throw new BadRequestError("Bot traffic detected");
  }
  next();
});
app.use("/api", routes);
swaggerDocs(app);

// // ========================
// // Error Handling
// // ========================
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return err.format(res); // ✅ returns structured JSON
  }

  // Fallback for unhandled errors
  logger.error(err);

  if (err?.code === 11000) {
    return res.status(409).json({
      success: false,
      code: "CONFLICT",
      message: "This phone number is already registered.",
      error: "This phone number is already registered.",
      status: 409,
      timestamp: new Date().toISOString(),
    });
  }

  const message = toErrorMessage(
    err?.message || err,
    "Internal Server Error",
  );
  const twilio =
    twilioFieldsFromUnknown(err?.metadata) ??
    twilioFieldsFromUnknown(err?.message) ??
    twilioFieldsFromUnknown(err?.code);

  const body = {
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message,
    error: message,
    msg: message,
    status: 500,
    timestamp: new Date().toISOString(),
  };

  if (twilio) {
    body.twilio = twilio;
  }

  if (process.env.NODE_ENV !== "production" && err?.stack) {
    body.stack = err.stack;
  }

  return res.status(500).json(body);
});
export default app;

// app.get("/", (req, res) => {
//   res.status(200).json({
//     status: "ok",
//     message: "Welcome to the API",
//     timestamp: new Date().toISOString(),
//   });
// });
// export default app;
