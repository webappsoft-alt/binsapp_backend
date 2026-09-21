import express from "express";
import {
  createRating,
  getUserRatings,
  getAdminRatings,
  getOrderRating,
  getALLRatings,
} from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
const router = express.Router();

/**
 * @swagger
 * /api/rating/all:
 *   get:
 *     summary: Get all ratings
 *     tags: [Rating]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Ratings fetched successfully
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
 *                   example: Ratings fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     ratings:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalLength:
 *                       type: number
 *                     avg_rating:
 *                       type: number
 *                     rating1:
 *                       type: number
 *                     rating2:
 *                       type: number
 *                     rating3:
 *                       type: number
 *                     rating4:
 *                       type: number
 *                     rating5:
 *                       type: number
 *       500:
 *         description: Internal server error
 */
router.get("/", getALLRatings);

/**
 * @swagger
 * /api/rating/order/{orderId}:
 *   get:
 *     summary: Get rating for a specific order
 *     tags: [Rating]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the order to fetch rating for
 *     responses:
 *       200:
 *         description: Rating fetched successfully
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
 *                   example: Rating fetched successfully
 *                 data:
 *                   type: object
 *       404:
 *         description: Rating not found
 *       500:
 *         description: Internal server error
 */
router.get("/order/:orderId", getOrderRating);

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   - name: Rating
 *     description: Rating management
 *   - name: Admin Rating
 *     description: Admin Rating management
 */

/**
 * @swagger
 * /api/rating:
 *   post:
 *     summary: Create a new rating
 *     tags: [Rating]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order
 *               - to_id
 *               - rating
 *               - type
 *             properties:
 *               order:
 *                 type: string
 *                 description: ID of the order being rated
 *               to_id:
 *                 type: string
 *                 description: ID of the user being rated
 *               review:
 *                 type: string
 *                 description: Review comment
 *               rating:
 *                 type: number
 *                 description: Rating value (1-5)
 *               type:
 *                 type: string
 *                 enum: [renter, rentee]
 *                 description: Type of rater (renter or rentee)
 *     responses:
 *       200:
 *         description: Rating created successfully
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
 *                   example: Rating created successfully
 *                 data:
 *                   type: object
 *                   description: The created rating object
 *       400:
 *         description: Bad request
 *       404:
 *         description: User or Order not found
 *       500:
 *         description: Internal server error
 */
router.post("/", createRating);

/**
 * @swagger
 * /api/rating/all:
 *   get:
 *     summary: Get current user ratings
 *     tags: [Rating]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Ratings fetched successfully
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
 *                   example: Ratings fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     ratings:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalLength:
 *                       type: number
 *                     avg_rating:
 *                       type: number
 *                     rating1:
 *                       type: number
 *                     rating2:
 *                       type: number
 *                     rating3:
 *                       type: number
 *                     rating4:
 *                       type: number
 *                     rating5:
 *                       type: number
 *       500:
 *         description: Internal server error
 */
router.get("/all", getUserRatings);

/**
 * @swagger
 * /api/rating/{userId}:
 *   get:
 *     summary: Get current user ratings
 *     tags: [Rating]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Ratings fetched successfully
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
 *                   example: Ratings fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     ratings:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalLength:
 *                       type: number
 *                     avg_rating:
 *                       type: number
 *                     rating1:
 *                       type: number
 *                     rating2:
 *                       type: number
 *                     rating3:
 *                       type: number
 *                     rating4:
 *                       type: number
 *                     rating5:
 *                       type: number
 *       500:
 *         description: Internal server error
 */
router.get("/:userId", getUserRatings);

/**
 * @swagger
 * /api/rating/admin/{userId}:
 *   get:
 *     summary: Get ratings for a specific user (Admin only)
 *     tags: [Admin Rating]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to fetch ratings for
 *     responses:
 *       200:
 *         description: Ratings fetched successfully
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
 *                   example: Ratings fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     ratings:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalLength:
 *                       type: number
 *                     avg_rating:
 *                       type: number
 *                     rating1:
 *                       type: number
 *                     rating2:
 *                       type: number
 *                     rating3:
 *                       type: number
 *                     rating4:
 *                       type: number
 *                     rating5:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get("/admin/:userId/", [authenticate, admin], getAdminRatings);

export default router;
