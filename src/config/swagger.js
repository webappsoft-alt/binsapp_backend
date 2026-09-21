import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import config from "./env.js";
import logger from "./logger.js";

const swaggerOptions = {
  definition: {
    openapi: "3.1.1",
    info: {
      title: config.get("appinfo.name"),
      version: "1.0.0",
      description: config.get("appinfo.description"),
      contact: {
        name: "API Support",
        email: `${config.get("appinfo.supportEmail")}`,
        url: `${config.get("frontendUrl")}/support`,
      },
      // license: {
      //   name: "License",
      //   url: "https://citisolution.com/license",
      // },
    },
    servers: [
      {
        url: `http://localhost:${config.get("port")}`,
        description: `${config.get("env")} server`,
      },
      {
        url: `https://qqa.binsapp.ai/`,
        description: "Production server",
      },
      {
        url: `https://z2tb5lx8-1200.uks1.devtunnels.ms/`,
        description: "Testing server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT Authorization header using the Bearer scheme",
        },
      },
      schemas: {
        AuthUser: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string", example: "John Doe" },
            email: { type: "string", format: "email" },
            role: { type: "string", example: "user" },
            avatar: { type: "string", format: "uri" },
          },
        },
        AuthTokens: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/AuthUser" },
            tokens: { $ref: "#/components/schemas/AuthTokens" },
          },
        },
        Error: {
          type: "object",
          properties: {
            code: { type: "string", example: "AUTH_001" },
            message: { type: "string", example: "Authentication failed" },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: "Invalid or missing authentication credentials",
        },
        ForbiddenError: {
          description: "Insufficient permissions for the request",
        },
        BadRequestError: {
          description: "Malformed or missing data",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
        NotFoundError: {
          description: "Requested resource was not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                success: false,
                code: "NOT_FOUND",
                message: "Resource not found",
                status: 404,
                timestamp: "2025-06-27T12:34:56.789Z",
                correlationId: "abc123xyz",
              },
            },
          },
        },
        ConflictError: {
          description: "Email already exists or other conflict",
        },
        InternalServerError: {
          description: "Internal server error occurred",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                success: false,
                code: "INTERNAL_SERVER_ERROR",
                message: "An unexpected error occurred",
                status: 500,
              },
            },
          },
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
    tags: [
      {
        name: "Authentication",
        description:
          "Auth management: OTP, login, register, Google OAuth, Refresh JWT tokens",
      },
      { name: "User", description: "User operations and profile management" },
      { name: "Template", description: "Template management operations" },
    ],
  },

  apis: ["./src/modules/**/routes.js", "./src/modules/**/controller.js"],
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);

export const swaggerDocs = (app) => {
  // JSON endpoint
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // UI setup
  const options = {
    explorer: true,
    customSiteTitle: `${config.get("appinfo.name")}`,
    swaggerOptions: {
      //  url: "http://192.168.18.134:9000/api-docs.json",
      validatorUrl: null,
      persistAuthorization: true,
      docExpansion: "none",
    },
  };
  app.use("/api-docs", (req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval';",
    );
    next();
  });
  app.use(
    "/api-docs",
    swaggerUi.serveFiles(swaggerSpec, options),
    swaggerUi.setup(swaggerSpec, options),
  );

  logger.info(
    `📚 API documentation available at ${config.get("frontendUrl")}/api-docs`,
  );
};
