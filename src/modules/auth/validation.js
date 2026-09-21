import Joi from "joi";

/** Optional FCM token fields — ignored on send-otp; must not fail when push is disabled. */
const optionalFcmFields = {
  fcmtoken: Joi.any().optional().allow(null, "", false),
  fcmToken: Joi.any().optional().allow(null, "", false),
  fcm_token: Joi.any().optional().allow(null, "", false),
};

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const sendOTPSchecma = Joi.object({
  phone: Joi.string().required(),
  ...optionalFcmFields,
}).unknown(true);
export const verifyOTPSchecma = Joi.object({
  fcmtoken: Joi.any().optional().allow(null, "", false),
  fcmToken: Joi.any().optional().allow(null, "", false),
  fcm_token: Joi.any().optional().allow(null, "", false),
  code: Joi.string().required(),
  token: Joi.string().required(),
}).unknown(true);
export const verifyForgotOTP = Joi.object({
  code: Joi.string().required(),
});
export const updatePassword = Joi.object({
  newPassword: Joi.string().required(),
});
export const refreshToken = Joi.object({
  refreshToken: Joi.string().required(),
});
