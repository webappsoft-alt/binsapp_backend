import express from "express";
import {
  sendOtpController,
  verifyOtpController,
  registerUserController,
  loginUserController,
  googleLoginController,
  forgotPasswordOTPController,
  refreshTokenController,
  verifyForgotOtpController,
  updatePasswordController,
  verifyUserApplication,
  verifyDocumentController,
  checkEmailController,
} from "./controller.js";
import { verifyApplicationToken, verifyPasswordResetToken } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  registerSchema,
  loginSchema,
  sendOTPSchecma,
  verifyOTPSchecma,
  verifyForgotOTP,
  updatePassword,
  refreshToken,
} from "./validation.js";
import { otpSendGuard } from "../../middlewares/otpSendGuard.js";
import { otpPhonePrep } from "../../middlewares/otpPhonePrep.js";

const router = express.Router();

// NOTE: OTP rate limiting is handled entirely by otpSendGuard (otpProtection),
// which is Redis-backed and therefore inspectable + resettable per number via
// scripts/otp-status.js. The previous express-rate-limit here used an in-memory
// store whose counter could not be read or reset by any script (only a full
// pm2 restart cleared it for everyone), so it was removed to keep all limits in
// one place.

/**
 * @swagger
 * /api/auth/verify-user-application:
 *   post:
 *     summary: Verify user application
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, role]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: User's phone number
 *                 example: "+1234567890"
 *               role:
 *                 type: string
 *                 description: User's role
 *                 example: "junkRemoval"
 *     responses:
 *       200:
 *         description: User application verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User application verified successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Failed to verify user application
 */
router.post("/verify-user-application", verifyUserApplication);

/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send OTP to a user's phone number
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: User's phone number
 *                 example: "+1234567890"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP sent successfully
 *       409:
 *         $ref: '#/components/responses/ConflictError'
 *       500:
 *         description: Failed to send OTP
 */
router.post(
  "/send-otp",
  otpPhonePrep,
  validate(sendOTPSchecma),
  otpSendGuard,
  sendOtpController,
);

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify an OTP code
 *     description: Verify the OTP code sent to the user's phone number
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, token]
 *             properties:
 *               fcmtoken:
 *                 type: string
 *                 description: Firebase Cloud Messaging token (optional)
 *                 example: "dXJhbmRvbV9mY21fdG9rZW4="
 *               code:
 *                 type: string
 *                 description: OTP code received
 *                 example: "123456"
 *               token:
 *                 type: string
 *                 description: Verification token
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP verified successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       500:
 *         description: OTP verification failed
 */
router.post("/verify-otp", validate(verifyOTPSchecma), verifyOtpController);

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Refresh JWT tokens
 *     description: Exchange a valid refresh token for a new access and refresh token pair.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6...
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Token refreshed successfully
 *                 tokens:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/refresh-token", validate(refreshToken), refreshTokenController);

/**
 * @swagger
 * /api/auth/verify-application-document:
 *   put:
 *     summary: Update authenticated user's profile
 *     description: Updates the authenticated user's profile information. All fields are required as per validation schema.
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               junkRemoval:
 *                 type: object
 *                 required: [companyName, legalBusinessName, sameDayAvailable, ein]
 *                 properties:
 *                   companyName:
 *                     type: string
 *                   legalBusinessName:
 *                     type: string
 *                   sameDayAvailable:
 *                     type: boolean
 *                   ein:
 *                     type: string
 *                   drivers_license:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: URLs to driving license images
 *                   COI:
 *                     type: string
 *                     description: URL to Certificate of Insurance
 *                   Business_license:
 *                     type: string
 *                     description: URL to Business License
 *                   minimum_insurance_amount:
 *                     type: number
 *               treeRemoval:
 *                 type: object
 *                 required: [companyName, legalBusinessName, sameDayAvailable, ein]
 *                 properties:
 *                   companyName:
 *                     type: string
 *                   legalBusinessName:
 *                     type: string
 *                   sameDayAvailable:
 *                     type: boolean
 *                   ein:
 *                     type: string
 *                   drivers_license:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: URLs to driving license images
 *                   COI:
 *                     type: string
 *                     description: URL to Certificate of Insurance
 *                   License_Type:
 *                     type: string
 *                   License_Number:
 *                     type: string
 *                   License_State:
 *                     type: string
 *                   License_Expiration:
 *                     type: string
 *                   Tree_removal_license:
 *                     type: string
 *                     description: URL to Tree Removal License
 *                   Workers_comp:
 *                     type: string
 *                     description: URL to Workers Compensation document
 *                   Certified_arborist:
 *                     type: boolean
 *                     description: Whether the user is a certified arborist
 *                   Arborist_credential:
 *                     type: string
 *           examples:
 *            
 *             JunkRemoval:
 *               summary: Example for Junk Removal service provider
 *               value:
 *                 junkRemoval:
 *                   companyName: Junk Busters Corp
 *                   legalBusinessName: Junk Busters LLC
 *                   sameDayAvailable: true
 *                   ein: "12-3456789"
 *                   drivers_license: ["https://example.com/dl1.jpg", "https://example.com/dl2.jpg"]
 *                   COI: https://example.com/coi.pdf
 *                   Business_license: https://example.com/biz_lic.jpg
 *             TreeRemoval:
 *               summary: Example for Tree Removal service provider
 *               value:
 *                 treeRemoval:
 *                   companyName: Tree Experts Corp
 *                   legalBusinessName: Tree Experts LLC
 *                   sameDayAvailable: false
 *                   ein: "98-7654321"
 *                   drivers_license: ["https://example.com/tree_dl1.jpg"]
 *                   COI: https://example.com/tree_coi.pdf
 *                   Tree_removal_license: https://example.com/tree_lic.jpg
 *                   Workers_comp: https://example.com/workers_comp.pdf
 *                   Certified_arborist: true
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Profile updated successfully
 *                 user:
 *                   type: object
 *                   description: Updated user object with all profile information
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put("/verify-application-document", verifyApplicationToken, verifyDocumentController)

/**
 * @swagger
 * /api/auth/check-email:
 *   post:
 *     summary: Check if an email is available
 *     description: Checks if an email is available for registration
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email to check
 *                 example: "test@example.com"
 *     responses:
 *       200:
 *         description: Email is available
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email is available
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       500:
 *         description: Internal server error
 */
router.post("/check-email", checkEmailController);

export default router;
