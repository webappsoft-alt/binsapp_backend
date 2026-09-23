import jwt from "jsonwebtoken";
import config from "../config/env.js";
import { UnauthorizedError, ForbiddenError } from "../utils/apiError.js";
import User from "../models/User.js";
import { AssignOrder, SubUserDetail } from "../models/AssignOrder.js";

/**
 * Middleware to verify JWT access token
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authorization token missing or malformed");
    }

    const token = authHeader.split(" ")[1];
    const secret = config.get("jwtSecret");

    if (!secret) throw new Error("JWT secret not configured");

    const decoded = jwt.verify(token, secret);

    // Fetch user (optional but good for RBAC or user checks)
    const user = await User.findById(decoded._id);
    if (!user) throw new ForbiddenError("User no longer exists");

    // Optional: block non-active users
    if (user.status === "deleted" || user.status === "deactivated") {
      throw new ForbiddenError(`User account is ${user.status}`);
    }

    // Attach to request
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    next(
      err.name === "TokenExpiredError"
        ? new UnauthorizedError("Session expired, please login again")
        : new UnauthorizedError("Invalid or expired token"),
    );
  }
};

export const admin = (req, res, next) => {
  // console.log("admin", req.user.role);
  if (
    req.user.role == "admin" ||
    req.user.role == "superadmin"
    // ||
    // req.user.type == "admin" ||
    // req.user.type == "superadmin"
  ) {
    return next();
  }
  next(new ForbiddenError("Admin access required"));
};

/**
 * Middleware to verify the password reset JWT token.
 * The token must be provided via `Authorization: Bearer <token>` header.
 */
export function verifyPasswordResetToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Token missing from authorization header");
    }

    const token = authHeader.split(" ")[1];
    const secret = config.get("jwtSecret");

    if (!secret) throw new Error("JWT_PASSWORD_RESET_SECRET is not set");

    const decoded = jwt.verify(token, secret);

    // You can optionally validate token purpose/type here
    if (decoded.purpose !== "password_reset") {
      throw new UnauthorizedError("Invalid token purpose");
    }

    // Attach decoded data to request
    req.user = decoded; // e.g. { email: ..., type: "password_reset" }

    next();
  } catch (err) {
    next(new UnauthorizedError(err.message));
  }
}

export const subUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authorization token missing or malformed");
    }

    const token = authHeader.split(" ")[1];
    const secret = config.get("jwtSecret");

    if (!secret) throw new Error("JWT secret not configured");

    const decoded = jwt.verify(token, secret);

    let subUserDoc = null;
    let activeAssignment = null;
    // console.log("decoded", JSON.stringify(decoded, null, 2, 4));
    // 1. Check if token contains SubUserDetail ID (New Multi-Job Flow)
    subUserDoc = await SubUserDetail.findById(decoded.subUserDetail?._id);
    // console.log("subUserDoc", subUserDoc);
    if (subUserDoc) {
      // Driver Identity verified. Ab relevant order determine karein:
      const targetOrderId =
        req.headers["x-order-id"] ||
        req.query.orderId ||
        req.body?.orderId ||
        req.params?.orderId;
      // console.log("targetOrderId", targetOrderId);
      if (targetOrderId) {
        // Specific order action
        activeAssignment = await AssignOrder.findOne({
          subUserDetail: subUserDoc._id,
          orderId: targetOrderId,
          status: { $nin: ["cancelled"] },
        });
      }
    } else {
      // 2. Backward Compatibility: Token me agar purani AssignOrder ID ho
      const legacyAssignOrder = await AssignOrder.findById(
        decoded._id,
      ).populate("subUserDetail");
      if (legacyAssignOrder) {
        subUserDoc = legacyAssignOrder.subUserDetail;
        activeAssignment = legacyAssignOrder;
      }
    }

    if (!subUserDoc) {
      throw new ForbiddenError("Driver/SubUser account not found");
    }

    if (subUserDoc.status === "inactive") {
      throw new ForbiddenError("Driver account is deactivated");
    }
    // console.log("activeAssignment", activeAssignment);
    // console.log("subUserDoc", subUserDoc);
    // 3. Attach standard properties (0% breaking change for existing controllers)
    req.user = subUserDoc;
    req.orderId = activeAssignment ? activeAssignment.orderId : null;
    req.assignBy = decoded.assignBy;
    req.assignOrderId = activeAssignment ? activeAssignment._id : null;
    req.activeAssignment = activeAssignment;
    req.token = token;

    next();
  } catch (error) {
    next(error);
  }
};

export const verifyApplicationToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authorization token missing or malformed");
    }

    const token = authHeader.split(" ")[1];
    const secret = config.get("jwtIDPrivateKey");
    // console.log(`secret ${secret}`);

    if (!secret) throw new Error("JWT ID Private Key not configured");

    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded._id);
    if (!user) throw new ForbiddenError("User no longer exists");
    req.user = user;
    next();
  } catch (error) {
    console.log(error);

    next(
      error.name === "TokenExpiredError"
        ? new UnauthorizedError("Session expired, please login again")
        : new UnauthorizedError("Invalid or expired token"),
    );
  }
};
