import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { createFavorite, deleteFavorite, getFavorites } from "./controller.js";

const router = Router();
router.use(authenticate);
/**
 * @swagger
 * tags:
 *   name: Favorite
 *   description: Favorite routes management
 */

/**
 * @swagger
 * /api/favorite:
 *   post:
 *     summary: Create a new favorite
 *     tags: [Favorite]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user:
 *                 type: string
 *                 description: ID of the user to be favorited
 *             required:
 *               - user
 *     responses:
 *       201:
 *         description: Favorite created successfully
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
 *                   example: Favorite created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     user:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/", createFavorite);

/**
 * @swagger
 * /api/favorite:
 *   delete:
 *     summary: Delete a favorite
 *     tags: [Favorite]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user:
 *                 type: string
 *                 description: ID of the favorited user to remove
 *             required:
 *               - user
 *     responses:
 *       200:
 *         description: Favorite deleted successfully
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
 *                   example: Favorite deleted successfully
 *                 data:
 *                   type: object
 *                   description: Result of the deletion operation
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete("/", deleteFavorite);

/**
 * @swagger
 * /api/favorite:
 *   get:
 *     summary: Get all favorites for the current user
 *     tags: [Favorite]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by user name or email
 *     responses:
 *       200:
 *         description: Favorites fetched successfully
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
 *                   example: Favorites fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     favorites:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           user:
 *                             type: object
 *                             description: The favorited user details (populated)
 *                           createdAt:
 *                             type: string
 *                           updatedAt:
 *                             type: string
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/", getFavorites);

export default router;
