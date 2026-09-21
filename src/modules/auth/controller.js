import {
  sendOtp,
  verifyOtp,
  registerUser,
  loginUser,
  forgotPasswordOTP,
  loginWithGoogle,
  refreshTokens,
  forgetPasswordOTPVerification,
  updatePassword,
  applyForTreeRemoval,
  checkEmail,
} from "./service.js";
import { updateUser } from "../users/service.js"
import {
  ApiError,
  InternalServerError,
} from "../../utils/apiError.js";
import { logger } from "../../config/logger.js";
import { toErrorMessage } from "../../utils/errorMessage.js";

export async function verifyUserApplication(req, res, next) {
  try {
    const { phone } = req.body;
    const result = await applyForTreeRemoval(phone);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// POST /auth/send-otp
export async function sendOtpController(req, res, next) {
  try {
    const { phone, hash } = req.body;
    console.log("hash", hash);
    // logger.info("auth.send-otp.request", {
    //   method: req.method,
    //   route: req.originalUrl,
    //   phone,
    //   hasAuthorizationHeader: Boolean(req.headers.authorization),
    //   userAgent: req.headers["user-agent"],
    //   contentType: req.headers["content-type"],
    // });
    const result = await sendOtp(phone, hash);
    // logger.info("auth.send-otp.success", {
    //   route: req.originalUrl,
    //   phone,
    // });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    try {
      logger.error("auth.send-otp.failure", {
        route: req.originalUrl,
        phone: req.body?.phone,
        errorName: err?.name,
        errorCode: err?.code,
        errorStatus: err?.statusCode || err?.status,
        errorMessage: err?.message,
        twilio: err?.metadata?.twilio,
        hasAuthorizationHeader: Boolean(req.headers.authorization),
        userAgent: req.headers["user-agent"],
      });
    } catch {
      // never lose the original OTP error because logging failed
    }
    if (err instanceof ApiError) {
      return next(err);
    }
    return next(
      new InternalServerError(
        toErrorMessage(err?.message || err, "Failed to send OTP"),
      ),
    );
  }
}

// POST /auth/verify-otp
export async function verifyOtpController(req, res, next) {
  try {
    const fcmtoken =
      req.body.fcmtoken ?? req.body.fcmToken ?? req.body.fcm_token ?? null;
    const { code, token } = req.body;
    const result = await verifyOtp(fcmtoken, code, token);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error("auth.verify-otp.failure", {
      route: req.originalUrl,
      errorMessage: err?.message,
      errorCode: err?.code,
    });
    next(err);
  }
}

// POST /auth/register
export async function registerUserController(req, res, next) {
  try {
    const result = await registerUser(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(
      err instanceof ApiError
        ? err
        : new ApiError("REGISTER_FAILED", 500, err.message),
    );
  }
}

// POST /auth/login
export async function loginUserController(req, res, next) {
  try {
    const result = await loginUser(req.body);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(
      err instanceof ApiError
        ? err
        : new ApiError("LOGIN_FAILED", 500, err.message),
    );
  }
}

// POST /auth/google
export async function googleLoginController(req, res, next) {
  try {
    const { idToken } = req.body;
    const result = await loginWithGoogle(idToken);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(
      err instanceof ApiError
        ? err
        : new ApiError("GOOGLE_LOGIN_FAILED", 500, err.message),
    );
  }
}

/**
 * @desc Forgot Password Controller
 * @route POST /api/auth/forgot-password
 * @access Public
 */
export const forgotPasswordOTPController = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      throw new BadRequestError("Valid email is required");
    }

    const result = await forgotPasswordOTP(email);
    res.status(200).json({
      success: true,
      message: result.message,
      // Remove this in production
      code: result.code,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Controller to verify OTP for password reset and return update token
 * @route POST /api/auth/verify-forgot-otp
 * @access Public
 */
export async function verifyForgotOtpController(req, res, next) {
  try {
    const { code } = req.body;

    if (!code) throw new BadRequestError("OTP code is required");

    const result = await forgetPasswordOTPVerification(code);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc Controller to update user password after token verification
 * @route PATCH /api/auth/update-password
 * @access Public (Token-based access via middleware)
 */
export async function updatePasswordController(req, res, next) {
  try {
    const { email } = req.user; // comes from reset token middleware
    const { newPassword } = req.body;

    const result = await updatePassword(email, newPassword);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc Handle refresh token and return new access/refresh tokens
 * @route POST /auth/refresh-token
 * @access Public
 */
export async function refreshTokenController(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new ApiError(
        "REFRESH_TOKEN_REQUIRED",
        400,
        "Refresh token is required",
      );
    }

    const data = await refreshTokens(refreshToken);
    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      ...data,
    });
  } catch (err) {
    next(err);
  }
}


export async function verifyDocumentController(req, res, next) {
  try {
    const userId = req.user._id;
    const updates = req.body;

    console.log("req.body", JSON.stringify(updates, null, 2));

    const updatedUser = await updateUser(userId, updates);

    res.status(200).json({
      success: true,
      message: "Document has been submitted successfully",
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
}

export async function checkEmailController(req, res, next) {
  try {
    const { email } = req.body;
    const result = await checkEmail(email);
    res.status(200).json({ success: true, message: "Email is available" });
  } catch (err) {
    next(err);
  }
}