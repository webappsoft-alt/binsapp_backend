import TempUser from "../../models/TempUser.js";
import User from "../../models/User.js";
import {
  generateOTP,
  generateAccessToken,
  generateRefreshToken,
  decodeToken,
  generatePasswordUpdateToken,
  generateIdToken,
} from "../../utils/Generator.js";
import {
  UnauthorizedError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  InternalServerError,
} from "../../utils/apiError.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import admin from "../../config/firebase.js";
import {
  sendSMSOTP,
  verifyCode,
  parseTwilioError,
} from "../../utils/sendOTP.js";
import {
  normalizePhone,
  phoneLookupVariants,
} from "../../utils/phone.js";
import { isStaticOtpPhone } from "../../utils/staticOtpPhones.js";
import { toErrorMessage } from "../../utils/errorMessage.js";
import config from "../../config/env.js";
// import { logger } from "../../config/logger.js";
import twilio from "twilio";
const client = twilio(
  config.get("twilio.accountSid"),
  config.get("twilio.authToken"),
);
import logger from "../../config/logger.js";
const OTP_EXPIRY_MINUTES = 10;

function throwTwilioSendError(twilioError) {
  const parsed =
    twilioError?.httpStatus !== undefined
      ? twilioError
      : parseTwilioError(twilioError);

  const twilioText = [
    parsed.twilioCode
      ? `Twilio error ${parsed.twilioCode}: ${parsed.twilioMessage || "request failed"}`
      : parsed.twilioMessage || parsed.message,
    parsed.hint,
  ]
    .filter(Boolean)
    .join(" — ");

  const message = toErrorMessage(
    parsed.message || twilioText,
    twilioText || "Twilio SMS verification failed",
  );

  const metadata = {
    twilio: {
      httpStatus: parsed.httpStatus,
      code: parsed.twilioCode,
      message: parsed.twilioMessage,
      moreInfo: parsed.moreInfo,
      hint: parsed.hint,
    },
  };

  if (parsed.httpStatus >= 400 && parsed.httpStatus < 500) {
    throw new BadRequestError(message, [], metadata);
  }
  throw new InternalServerError(message, metadata);
}

async function findUserByPhone(phone) {
  const variants = phoneLookupVariants(phone);
  return User.findOne({ phone: { $in: variants } });
}

async function assertPhoneCanReceiveSms(phoneNumber) {
  try {
    const response = await client.lookups.v2
      .phoneNumbers(phoneNumber)
      .fetch({ fields: "line_type_intelligence" });

    const type = response.lineTypeIntelligence?.type;
    logger.info("Twilio line type lookup", { phoneNumber, type });

    const smsCapableTypes = new Set(["mobile", "nonFixedVoip"]);
    if (smsCapableTypes.has(type)) {
      return true;
    }

    if (type === "landline") {
      throw new BadRequestError(
        "This landline number cannot receive SMS codes. Please use a mobile number.",
      );
    }

    if (type === "fixedVoip" || type === "voip") {
      throw new BadRequestError(
        "This phone number cannot receive SMS verification codes. Please use a mobile number.",
      );
    }

    if (!type) {
      throw new BadRequestError(
        "Unable to verify this phone number for SMS. Please check the number and try again.",
      );
    }

    throw new BadRequestError(
      `This phone number cannot receive SMS verification codes (line type: ${type}).`,
    );
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    const parsed = parseTwilioError({
      code: error.code,
      message: error.message,
      more_info: error.moreInfo,
      status: error.status,
    });
    logger.error("Twilio Lookup failed:", { phoneNumber, ...parsed });

    if (parsed.httpStatus === 401 || parsed.twilioCode === 20003) {
      throwTwilioSendError(parsed);
    }

    if (parsed.twilioCode === 20404) {
      throw new BadRequestError(
        "This phone number is invalid or not recognized. Please check and try again.",
      );
    }

    throw new BadRequestError(
      "Unable to verify this phone number. Please check the number and try again.",
    );
  }
}

export async function applyForTreeRemoval(phone) {
  try {
    const existingUser = await User.findOne({ phone })
      .populate(["junkRemoval", "treeRemoval", "company"])
      .lean();

    if (!existingUser) {
      throw new NotFoundError("User not found");
    }
    if (existingUser.status === "deleted")
      throw new BadRequestError("Your account is deleted");
    else if (existingUser.status === "deactivated")
      throw new BadRequestError("Your account is deactivated");
    const idToken = generateIdToken(existingUser._id.toString());
    return { ...existingUser, token: idToken };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

// STEP 1: Send OTP to Email
export async function sendOtp(phone, hash) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new BadRequestError("Phone number is required");
  }

  try {
    const useStaticOtp = isStaticOtpPhone(normalizedPhone);
    logger.info("sendOtp.start", {
      inputPhone: phone,
      normalizedPhone,
      useStaticOtp,
    });

    let existingUser = await findUserByPhone(normalizedPhone);
    if (!existingUser) {
      // await assertPhoneCanReceiveSms(normalizedPhone);
      try {
        existingUser = await User.create({ phone: normalizedPhone });
      } catch (error) {
        if (error?.code === 11000) {
          existingUser = await findUserByPhone(normalizedPhone);
          if (!existingUser) {
            throw new BadRequestError(
              "This phone number is already registered. Please try again or contact support.",
            );
          }
        } else {
          logger.error("sendOtp user create failed", {
            phone: normalizedPhone,
            error: error.message,
          });
          throw new InternalServerError(
            toErrorMessage(error?.message, "Failed to create user for OTP"),
          );
        }
      }
    } else if (existingUser.phone !== normalizedPhone) {
      existingUser.phone = normalizedPhone;
      await existingUser.save();
    }

    if (existingUser.status === "deleted")
      throw new BadRequestError("Your account is deleted");
    else if (existingUser.status === "deactivated")
      throw new BadRequestError("Your account is deactivated");

    const Token = generateIdToken(existingUser._id);
    let result;
    if (useStaticOtp) {
      logger.info("sendOtp.static_bypass", { phone: normalizedPhone });
      result = { data: { code: "1234" } };
    } else {
      result = await sendSMSOTP(normalizedPhone, hash);
      if (!result.success) {
        throwTwilioSendError(result.error);
      }
    }

    return {
      message: "OTP sent to your phone",
      code: result.data?.code,
      token: Token,
    };
  } catch (error) {
    if (
      error instanceof BadRequestError ||
      error instanceof InternalServerError ||
      error instanceof UnauthorizedError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    logger.error("sendOtp.unhandled", {
      phone: normalizedPhone,
      errorName: error?.name,
      errorMessage: error?.message,
    });
    throw new InternalServerError(
      toErrorMessage(error?.message || error, "Failed to send OTP"),
    );
  }
}

// STEP 2: Verify OTP
export async function verifyOtp(fcmtoken, code, token) {
  try {
    const user = jwt.verify(token, config.get("jwtIDPrivateKey"));

    const newUser = await User.findOne({ _id: user._id });
    let result;
    let success = true;
    const staticOtp = isStaticOtpPhone(newUser.phone);
    if (staticOtp && code === "1234") {
      logger.info("verifyOtp.static_bypass", { phone: newUser.phone });
      success = true;
    } else {
      result = await verifyCode(newUser.phone, code);
      success = result.success;
    }
    // console.log("newUser", newUser, "code", code);
    if (success) {
      if (fcmtoken) {
        newUser.fcmtoken = fcmtoken;
      }
      await newUser.save();
      const populatedUser = await User.findById(newUser._id).populate([
        "junkRemoval",
        "treeRemoval",
        "company",
      ]);
      const payload = { _id: user._id, phone: user.phone, type: user.type };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      return {
        tokens: {
          accessToken,
          refreshToken,
        },
        user: populatedUser,
      };
    } else {
      console.log(result.error);
      throw new BadRequestError("OTP verification failed");
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}

// STEP 3: Register User
export async function registerUser({ email, name, password }) {
  const checkUser = await User.findOne({ email });
  if (checkUser) throw new BadRequestError("Email is already in use");

  const tempUser = await TempUser.findOne({ email });
  if (!tempUser) throw new BadRequestError("OTP not verified");

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    isEmailVerified: true,
  });

  await TempUser.deleteOne({ email, type: "verification" });

  const payload = { _id: user._id, email: user.email };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  // console.log(refreshToken);
  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      //   role: user.role,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
}

/**
 * Login user using email and password
 * @param {Object} payload
 * @param {string} payload.email
 * @param {string} payload.password
 * @returns {Object} user + tokens
 */
export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (user.status !== "active") {
    throw new ForbiddenError(`Your account is ${user.status}`);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const payload = { _id: user._id, email: user.email };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
}

/**
 * Login/Register using Google OAuth Token (from Firebase)
 * @param {string} idToken - Google ID token from Firebase
 * @returns {Object} user + tokens
 */
export async function loginWithGoogle(idToken) {
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    throw new UnauthorizedError("Invalid or expired Google token");
  }

  const { email, name, picture, uid } = decoded;

  if (!email) {
    throw new UnauthorizedError(
      "Google account does not contain a verified email",
    );
  }

  let user = await User.findOne({ email });

  if (!user) {
    // Create new user
    user = await User.create({
      name: name || "Google User",
      email,
      googleId: uid,
      profile: { avatar: picture },
      authProvider: "google",
      isEmailVerified: true,
      status: "active",
    });
  }

  if (user.status !== "active") {
    throw new UnauthorizedError(`Your account is ${user.status}`);
  }

  const payload = { _id: user._id, email: user.email };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.profile.avatar,
      role: user.role,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
}

export async function forgotPasswordOTP(email) {
  const user = await User.findOne({ email });
  if (!user) throw new NotFoundError("User with this email does not exist");

  const code = generateOTP(6, { numeric: true });
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await TempUser.findOneAndUpdate(
    { email, type: "forgot" },
    { code, expiresAt, type: "forgot", attempts: 0 },
    { upsert: true, new: true },
  );

  // TODO: Integrate with your email service
  // await sendEmail(email, `Your password reset OTP is ${code}`);

  return { message: "Password reset OTP sent to your email", code };
}

/**
 * Verifies the OTP sent for password reset and issues a temporary password update token
 *
 * @param {string} code - OTP code submitted by the user
 * @returns {Object} - Contains success message and password update token
 * @throws {NotFoundError} - If no valid OTP is found
 * @throws {BadRequestError} - If OTP is expired or maximum attempts exceeded
 */
export async function forgetPasswordOTPVerification(code) {
  // Find OTP entry by code and type
  const tempUser = await TempUser.findOne({ code, type: "forgot" });

  // If no entry found, throw error
  if (!tempUser) {
    throw new NotFoundError("Invalid or expired OTP code");
  }

  // Check if maximum attempts exceeded
  if (tempUser.attempts >= 5) {
    throw new BadRequestError("Too many invalid attempts");
  }

  // Check if OTP is expired
  if (Date.now() > new Date(tempUser.expiresAt).getTime()) {
    await TempUser.deleteOne({ email: tempUser.email, type: "forgot" });
    throw new BadRequestError("OTP expired. Please request a new one.");
  }

  // OTP is valid – clean up temp record
  await TempUser.deleteOne({ email: tempUser.email, type: "forgot" });

  // Generate short-lived token to allow password reset
  const token = generatePasswordUpdateToken(tempUser.email);

  return {
    message: "OTP verified successfully",
    token,
  };
}
/**
 * Update user's password after token verification
 * @param {string} email - User's email from the verified reset token
 * @param {string} newPassword - New password to be set
 */
export async function updatePassword(email, newPassword) {
  if (!email || !newPassword)
    throw new BadRequestError("Email and password required");

  const user = await User.findOne({ email });
  if (!user) throw new NotFoundError("User not found");

  const hashed = await bcrypt.hash(newPassword, 10);
  user.password = hashed;
  await user.save();

  return { message: "Password updated successfully" };
}
/**
 * Refresh JWT access and refresh tokens
 * @param {string} token - The refresh token
 * @returns {Object} - New accessToken and refreshToken
 */
export async function refreshTokens(token) {
  if (!token) throw new UnauthorizedError("Refresh token missing");

  const decoded = decodeToken(token, "refresh");
  const payload = { _id: decoded._id, email: decoded.email };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    tokens: {
      accessToken,
      refreshToken,
    },
  };
}

export async function checkEmail(email) {
  const user = await User.findOne({ email });
  if (user) throw new BadRequestError("Email is already in use");
  return true;
}
