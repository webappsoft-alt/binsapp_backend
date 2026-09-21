import express from "express";
import {
  attendTheSupport,
  createSupport,
  deleteSupport,
  getSupport,
} from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { createSupportSchema } from "./validation.js";
const router = express.Router();
/**
 * @swagger
 * tags:
 *   - name: Support
 *     description: Support management
 *   - name: Admin Support
 *     description: Admin Support management
 *
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Support:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 60ae0d9f5b6c3c001c8f1234
 *         user:
 *           type: string
 *           description: ID of the user who created the ticket
 *         name:
 *           type: string
 *           example: John Doe
 *         email:
 *           type: string
 *           format: email
 *           example: john@example.com
 *         msg:
 *           type: string
 *           example: I need help with my order.
 *         supportId:
 *           type: string
 *           example: SP-1234567890
 *         attended:
 *           type: boolean
 *           default: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

router.use(authenticate);

/**
 * @swagger
 * /api/support/:
 *   post:
 *     summary: Create Support Ticket
 *     description: Creates a new support ticket.
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, msg]
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               msg:
 *                 type: string
 *                 example: I need help with my order.
 *     responses:
 *       200:
 *         description: Support ticket created successfully
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
 *                   example: Support created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Support'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/", validate(createSupportSchema), createSupport);

/**
 * @swagger
 * /api/support/:
 *   get:
 *     summary: Get Support Tickets
 *     description: Retrieves support tickets with optional search and pagination. Requires admin authentication.
 *     tags: [Admin Support]
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
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or supportId
 *     responses:
 *       200:
 *         description: Support tickets fetched successfully
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
 *                   example: Support fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     support:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Support'
 *                     totalPages:
 *                       type: integer
 *                     totalCount:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/", admin, getSupport);

/**
 * @swagger
 * /api/support/admin/{id}:
 *   put:
 *     summary: Attend Support Ticket
 *     description: Marks a support ticket as attended. Requires admin authentication.
 *     tags: [Admin Support]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: Support ticket attended successfully
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
 *                   example: Support attended successfully
 *                 data:
 *                   $ref: '#/components/schemas/Support'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put("/admin/:id", admin, attendTheSupport);

/**
 * @swagger
 * /api/support/admin/{id}:
 *   delete:
 *     summary: Delete Support Ticket
 *     description: Deletes a support ticket. Requires admin authentication.
 *     tags: [Admin Support]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: Support ticket deleted successfully
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
 *                   example: Support deleted successfully
 *                 data:
 *                   $ref: '#/components/schemas/Support'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete("/admin/:id", admin, deleteSupport);

export default router;
