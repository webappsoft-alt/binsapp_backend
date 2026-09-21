import config from "../config/env.js";
import jwt from "jsonwebtoken";

/**
 * Generate an OTP or token
 * @param {number} length - Desired length of the OTP/token
 * @param {Object} options - Configuration for characters
 * @param {boolean} options.numeric - Include numbers
 * @param {boolean} options.alphabet - Include alphabets (lowercase + uppercase)
 * @returns {string} Generated OTP/token
 */
export function generateOTP(
  length = 6,
  options = { numeric: true, alphabet: false }
) {
  let charset = "";

  if (options.numeric) charset += "0123456789";
  if (options.alphabet)
    charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

  if (!charset) {
    throw new Error(
      "At least one character set (numeric or alphabet) must be enabled"
    );
  }

  let otp = "";
  for (let i = 0; i < length; i++) {
    const randomIdx = Math.floor(Math.random() * charset.length);
    otp += charset[randomIdx];
  }

  return otp;
}

/**
 * Generate an access token
 * @param {Object} payload - The data to encode into the token
 * @returns {string} JWT access token
 */
export function generateAccessToken(payload) {
  const secret = config.get("jwtSecret");
  const expiresInMs = config.get("jwtAccessExpiration");
  const audience = config.get("jwtAudience");
  const issuer = config.get("jwtIssuer");
  const expiresIn = `${Math.floor(expiresInMs / 1000)}s`; // Convert to "900s" style

  if (!secret) throw new Error("JWT_SECRET is not set");
  if (!issuer) throw new Error("JWT_ISSUER is not set");
  if (!audience) throw new Error("JWT_AUDIENCE is not set");
  return jwt.sign(payload, secret, { expiresIn, issuer, audience });
}

/**
 * Generate a refresh token
 * @param {Object} payload - The data to encode into the token
 * @returns {string} JWT refresh token
 */
export function generateRefreshToken(payload) {
  const secret = config.get("refreshSecret");
  const expiresInMs = config.get("jwtRefreshExpiration");
  const expiresIn = `${Math.floor(expiresInMs / 1000)}s`; // Convert to "900s" style
  const audience = config.get("jwtAudience");
  const issuer = config.get("jwtIssuer");

  if (!secret) throw new Error("JWT_SECRET is not set");
  if (!issuer) throw new Error("JWT_ISSUER is not set");
  if (!audience) throw new Error("JWT_AUDIENCE is not set");
  return jwt.sign(payload, secret, { expiresIn, issuer, audience });
}

/**
 * Verify an access or refresh token
 * @param {string} token - The JWT to verify
 * @param {boolean} isRefresh - Whether to use refreshSecret for verification
 * @returns {Object} Decoded payload
 */
export function verifyToken(token, isRefresh = false) {
  const secret = isRefresh ? config.refreshSecret : config.jwtSecret;
  return jwt.verify(token, secret, {
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
}

/**
 * Decode and verify a JWT
 * @param {string} token - The JWT token to decode
 * @param {string} type - Token type: "access" or "refresh"
 * @returns {object} Decoded payload
 * @throws {UnauthorizedError} If token is invalid or expired
 */
export function decodeToken(token, type = "access") {
  try {
    const secret =
      type === "refresh"
        ? config.get("refreshSecret")
        : config.get("jwtSecret");

    if (!secret) throw new Error("JWT secret is missing");

    return jwt.verify(token, secret);
  } catch (err) {
    throw new UnauthorizedError("Invalid or expired token");
  }
}

/**
 * Generate a short-lived token specifically for password update
 * @param {string} email - The user's email
 * @returns {string} JWT token
 */
export function generatePasswordUpdateToken(email) {
  const secret = config.get("jwtSecret");

  if (!secret) throw new Error("JWT secret not configured");

  const payload = {
    email,
    purpose: "password_reset",
  };

  return jwt.sign(payload, secret, {
    expiresIn: "5m", // 5 minutes
    issuer: config.get("jwtIssuer"),
    audience: config.get("jwtAudience"),
  });
}

export function generatemfaToken(token) {
  const secret = config.get("mfaSecret");
  if (!secret) throw new Error("MFA secret not configured");

  try {
    return jwt.sign({ token }, secret, {
      expiresIn: "50m", // 5 minutes
      issuer: config.get("jwtIssuer"),
      audience: config.get("jwtAudience"),
    });
  } catch (error) {
    throw new Error("Failed to generate MFA token: " + error.message);
  }
}
export function biotoken(bio) {
  // const secret = ;
  const secret = config.get("jwtSecret") + config.get("refreshSecret");
  const audience = config.get("jwtAudience");
  const issuer = config.get("jwtIssuer");
  if (!secret) throw new Error("Bio secret not configured");
  try {
    if (!secret) throw new Error("JWT_SECRET is not set");
    if (!issuer) throw new Error("JWT_ISSUER is not set");
    if (!audience) throw new Error("JWT_AUDIENCE is not set");
    return jwt.sign(bio, secret, { issuer, audience });
  } catch (error) {
    throw new Error("Failed to generate Bio token: " + error.message);
  }
}

/**
 * Generate a randomized card-like number string from current timestamp + extra digits.
 * Splits into equal-sized chunks, shuffles them, and joins with spaces.
 *
 * @function cardNumberGenerator
 * @param {string|number} [extra=generateOTP(3)] - Extra digits to append (defaults to a 3-digit OTP).
 * @param {number} [size=4] - Length of each chunk (default: 4).
 * @returns {string} A randomized card-like number string (e.g., "8795 1756 0180 7981").
 */
export function cardNumberGenerator(extra = generateOTP(3), size = 4) {
  return (Date.now() + extra)
    .toString()
    .match(new RegExp(`.{1,${size}}`, "g")) // split into chunks
    .sort(() => Math.random() - 0.5) // shuffle
    .join(" "); // join with spaces
}
export default generateOTP;

export function generateIdToken(_id) {
  const expiresIn = 3600; // Token will expire in 1 hour (3600 seconds)
  const token = jwt.sign({ _id: _id }, config.get("jwtIDPrivateKey"), {
    expiresIn,
  });
  return token;
}
