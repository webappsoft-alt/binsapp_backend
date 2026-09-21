import { Router } from "express";
import {
  createPublicReview,
  deletePublicReview,
  getAllPublicReviewsForWebsite,
  getAllPublicReviewsbyAdmin,
} from "./controller.js";
import { validate } from "../../middlewares/validate.js";
import {
  createPublicReviewValidation,
  getAllPublicReviewsValidation,
  deletePublicReviewValidation,
  getAllPublicReviewsForWebsiteValidation,
} from "./validation.js";
import { authenticate, admin } from "../../middlewares/auth.js";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     PublicReview:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "John Doe"
 *         email:
 *           type: string
 *           format: email
 *           example: "[EMAIL_ADDRESS]"
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           example: 5
 *         title:
 *           type: string
 *           example: "Excellent Service"
 *         review:
 *           type: string
 *           example: "The service was great and the team was very professional."
 */

/**
 * @swagger
 * tags:
 *   name: Public Review
 *   description: Public review management
 */

/**
 * @swagger
 * /api/public-reviews/website:
 *   post:
 *     summary: Create a new public review
 *     tags: [Public Review]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PublicReview'
 *     responses:
 *       201:
 *         description: Public review created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/PublicReview' }
 */
router.post(
  "/website",
  validate(createPublicReviewValidation),
  createPublicReview,
);

/**
 * @swagger
 * /api/public-reviews/website:
 *   get:
 *     summary: Get all public reviews for website (paginated)
 *     tags: [Public Review]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: List of public reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     publicReviews:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PublicReview'
 *                     total: { type: integer }
 */
router.get(
  "/website",
  validate(getAllPublicReviewsForWebsiteValidation),
  getAllPublicReviewsForWebsite,
);

router.use(authenticate, admin);

/**
 * @swagger
 * /api/public-reviews:
 *   get:
 *     summary: Get all public reviews (admin)
 *     tags: [Public Review]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: isDeleted
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           description: Search by name, email, title, or review
 *     responses:
 *       200:
 *         description: List of public reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     publicReviews:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PublicReview'
 *                     total: { type: integer }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  "/",
  validate(getAllPublicReviewsValidation),
  getAllPublicReviewsbyAdmin,
);

/**
 * @swagger
 * /api/public-reviews/{id}:
 *   delete:
 *     summary: Delete a public review (soft delete)
 *     tags: [Public Review]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "60d5ec49f84b5c116c4e7a6d"
 *     responses:
 *       200:
 *         description: Public review deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     isDeleted: { type: boolean }
 *                     deletedAt: { type: string, format: date-time }
 */
router.delete(
  "/:id",
  validate(deletePublicReviewValidation),
  deletePublicReview,
);

export default router;
