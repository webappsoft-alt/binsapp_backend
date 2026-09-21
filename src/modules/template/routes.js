import { Router } from "express";
import {
  createTemplate,
  getAllTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
} from "./controller.js";
import { validate } from "../../middlewares/validate.js";
import { createTemplateSchema, updateTemplateSchema } from "./validation.js";
import { authenticate, admin } from "../../middlewares/auth.js";

const router = Router();
router.use(authenticate, admin);

/**
 * @swagger
 * components:
 *   schemas:
 *     Template:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "60ae0d9f5b6c3c001c8f1234"
 *         title:
 *           type: string
 *           example: "Template Title"
 *         description:
 *           type: string
 *           example: "Template Description"
 *         subject:
 *           type: string
 *           example: "Template Subject"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     TemplateInput:
 *       type: object
 *       required:
 *         - title
 *         - description
 *         - subject
 *       properties:
 *         title:
 *           type: string
 *           example: "Template Title"
 *         description:
 *           type: string
 *           example: "Template Description"
 *         subject:
 *           type: string
 *           example: "Template Subject"
 */

/**
 * @swagger
 * /api/template:
 *   post:
 *     summary: Create a new template
 *     tags: [Template]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TemplateInput'
 *     responses:
 *       201:
 *         description: Template created successfully
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
 *                   example: "Template created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Template'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post("/", validate(createTemplateSchema), createTemplate);

/**
 * @swagger
 * /api/template:
 *   get:
 *     summary: Get all templates
 *     tags: [Template]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title or subject
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
 *     responses:
 *       200:
 *         description: Templates fetched successfully
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
 *                   example: "Templates fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     templates:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Template'
 *                     total:
 *                       type: integer
 *                       example: 1
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/", getAllTemplates);

/**
 * @swagger
 * /api/template/{id}:
 *   get:
 *     summary: Get template by ID
 *     tags: [Template]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The template ID
 *     responses:
 *       200:
 *         description: Template fetched successfully
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
 *                   example: "Template fetched successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Template'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get("/:id", getTemplateById);

/**
 * @swagger
 * /api/template/{id}:
 *   put:
 *     summary: Update template
 *     tags: [Template]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               subject:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template updated successfully
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
 *                   example: "Template updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Template'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put("/:id", validate(updateTemplateSchema), updateTemplate);

/**
 * @swagger
 * /api/template/{id}:
 *   delete:
 *     summary: Delete template
 *     tags: [Template]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The template ID
 *     responses:
 *       200:
 *         description: Template deleted successfully
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
 *                   example: "Template deleted successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Template'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete("/:id", deleteTemplate);

export default router;
