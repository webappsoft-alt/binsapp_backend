import express from "express";

import { getAllNotifications, checkSeenNotifications, deleteNotification } from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notification
 *   description: Notification management
 */

router.use(authenticate);

/**
 * @swagger
 * /api/notification/all:
 *   get:
 *     summary: Get all notifications
 *     description: Retrieve a paginated list of notifications for the authenticated user.
 *     tags: [Notification]
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
 *         name: isSeen
 *         schema:
 *           type: boolean
 *         description: Filter by seen status
 *     responses:
 *       200:
 *         description: Notifications fetched successfully
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
 *                   example: Notifications fetched successfully
 *                 data:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
router.get('/all', getAllNotifications);

/**
 * @swagger
 * /api/notification/check-seen:
 *   get:
 *     summary: Get unseen notifications
 *     description: Retrieve a list of unseen notifications for the authenticated user.
 *     tags: [Notification]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Unseen notifications fetched successfully
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
 *                   example: Notifications fetched successfully
 *                 data:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
router.get('/check-seen', checkSeenNotifications);

/**
 * @swagger
 * /api/notification/{id}:
 *   delete:
 *     summary: Delete a notification
 *     description: Delete a specific notification by ID.
 *     tags: [Notification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted successfully
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
 *                   example: Notification deleted successfully
 *                 data:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', deleteNotification);


export default router;
