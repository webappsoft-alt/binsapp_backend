import express from "express";
import { createPaymentSchema, verifyAccountSchema } from "./validation.js";
import {
  createPaymentController,
  createAccountController,
  verifyAccountController,
  redirectCallbackController,
  createTransactionController,
  getTransactionsController,
  createTopUpPaymentController,
} from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
const router = express.Router();
router.use(authenticate);
/**
 * @swagger
 * tags:
 *   name: Payment
 *   description: Payment management
 */

/**
 * @swagger
 * /api/payment/:
 *   post:
 *     summary: Create a new payment
 *     description: Process a payment with specified amount and insurance options.
 *     tags: [Payment]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Payment amount
 *                 example: 100.00
 *               accountId:
 *                 type: string
 *                 description: Optional connected account for destination charges (omit for platform hold)
 *                 example: "acct_123456789"
 *               insurance_protection:
 *                 type: number
 *                 description: Cost or flag for insurance protection
 *                 example: 10.00
 *               cancellation_insurance:
 *                 type: number
 *                 description: Cost or flag for cancellation insurance
 *                 example: 5.00
 *               address:
 *                 type: object
 *                 description: Address for tax calculation
 *                 example: {
 *                   "line1": "123 Main St",
 *                   "city": "New York",
 *                   "state": "NY",
 *                   "zip": "10001",
 *                   "country": "US"
 *                 }
 *     responses:
 *       201:
 *         description: Payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientSecret:
 *                   type: string
 *                   description: Payment intent client secret from Stripe
 *                   example: "pi_123_secret_456"
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       500:
 *         description: Internal server error
 */
router.post("/", validate(createPaymentSchema), createPaymentController);
/**
 * @swagger
 * /api/payment/account:
 *   get:
 *     summary: Create Stripe Connect Account
 *     description: Creates a Stripe Express account for the user and returns the onboarding link.
 *     tags: [Payment]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Account created successfully
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
 *                   example: Account created successfully
 *                 data:
 *                   type: object
 *                   description: Stripe Account Link object
 *       500:
 *         description: Internal server error
 */
router.get("/account", createAccountController);

/**
 * @swagger
 * /api/payment/verify-account:
 *   post:
 *     summary: Verify Stripe Account Status
 *     description: Checks if the user's Stripe account is fully onboarded and charges are enabled.
 *     tags: [Payment]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe Account ID to verify
 *     responses:
 *       201:
 *         description: Account verified successfully
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
 *                   example: Account verified successfully
 *                 data:
 *                   type: object
 *                   description: Stripe Account object
 *       400:
 *         description: Account not fully connected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "You haven't completely connect your account to Stripe.."
 *       404:
 *         description: User or Account not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/verify-account",
  validate(verifyAccountSchema),
  verifyAccountController,
);

/**
 * @swagger
 * /api/payment/redirect/callback:
 *   get:
 *     summary: Stripe Onboarding Callback
 *     description: Callback endpoint for Stripe Connect onboarding flow. Returns a loading page.
 *     tags: [Payment]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Loading page HTML
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               example: "<!DOCTYPE html>..."
 *       500:
 *         description: Internal server error
 */
router.get("/redirect/callback", redirectCallbackController);

/**
 * @swagger
 * /api/payment/transaction:
 *   post:
 *     summary: Create a new transaction
 *     description: Records a new transaction (credit or debit) for the user.
 *     tags: [Payment]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - type
 *             properties:
 *               order:
 *                 type: string
 *                 description: ID of the related order
 *                 example: "60d0fe4f5311236168a109ca"
 *               amount:
 *                 type: number
 *                 description: Transaction amount
 *                 example: 50.00
 *               type:
 *                 type: string
 *                 enum: [credit, debit]
 *                 description: Type of transaction
 *                 example: "credit"
 *               stripePaymentIntentId:
 *                 type: string
 *                 description: Stripe Payment Intent ID associated with the transaction
 *                 example: "pi_123456789"
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *                 example: { "note": "Refund for order #123" }
 *     responses:
 *       201:
 *         description: Transaction created successfully
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
 *                   example: Transaction created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Bad Request
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post("/transaction", createTransactionController);

/**
 * @swagger
 * /api/payment/transactions:
 *   get:
 *     summary: Get user transactions
 *     description: Retrieve a paginated list of transactions for the authenticated user.
 *     tags: [Payment]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [credit, debit]
 *         description: Filter by transaction type
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions before this date
 *       - in: query
 *         name: afterDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions after this date
 *     responses:
 *       200:
 *         description: Transactions fetched successfully
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
 *                   example: Transactions fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Transaction'
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     CurrentBalance:
 *                       type: number
 *                       example: 150.00
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get("/transactions", getTransactionsController);

/**
 * @swagger
 * /api/payment/topup:
 *   post:
 *     summary: Create a Top-Up Payment
 *     description: Process a top-up payment for a user's account.
 *     tags: [Payment]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - accountId
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount to top up
 *                 example: 50.00
 *               accountId:
 *                 type: string
 *                 description: Stripe connected account ID
 *                 example: "acct_123456789"
 *     responses:
 *       201:
 *         description: TopUp Payment created successfully
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
 *                   example: TopUp Payment created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentIntent:
 *                       type: string
 *                       description: Client secret for the payment intent
 *                     ephemeralKey:
 *                       type: string
 *                       description: Ephemeral key secret
 *                     customer:
 *                       type: string
 *                       description: Customer ID
 *                     paymentId:
 *                       type: string
 *                       description: Payment Intent ID
 *       400:
 *         description: Bad Request
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post("/topup", createTopUpPaymentController);

export default router;
