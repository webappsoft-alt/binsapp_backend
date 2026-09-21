import express from "express";
import { createBin, updateBin } from "./validation.js";
import {
  createBinController,
  updateBinController,
  getAllBinsController,
  checkBinController,
  adminSideBinController,
  verifyBinController,
  deleteBinController,
  createBinAdminSideController,
} from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
const router = express.Router();
/**
 * @swagger
 * tags:
 *   name: Bin
 *   description: Bin management and dumpster operations
 */

/**
 * @swagger
 * /api/bin/:
 *   post:
 *     summary: Create a new bin/dumpster
 *     description: Creates a new bin/dumpster request for the authenticated user. Automatically increments the user's pending count and sends a notification to admin users.
 *     tags : [Bin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dumbster
 *               - location
 *               - address
 *               - insurancefile
 *               - registrationfile
 *               - issue_date
 *               - expiry_date
 *               - insurance_issue_date
 *               - insurance_expiry_date
 *               - type
 *               - quantity
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *                 description: Description of the bin/dumpster
 *                 example: "Large dumpster for construction site"
 *               dumbster:
 *                 type: string
 *                 description: Dumpster/bin identifier or name
 *                 example: "BIN-2024-001"
 *               location:
 *                 type: object
 *                 description: GeoJSON Point object for bin location
 *                 required:
 *                   - type
 *                   - coordinates
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [Point]
 *                     description: GeoJSON type (must be "Point")
 *                     example: "Point"
 *                   coordinates:
 *                     type: array
 *                     description: Array of [longitude, latitude]
 *                     items:
 *                       type: number
 *                     minItems: 2
 *                     maxItems: 2
 *                     example: [-74.0060, 40.7128]
 *               address:
 *                 type: string
 *                 description: Full address of the bin location
 *                 example: "123 Main St, New York, NY 10001"
 *               radius:
 *                 type: number
 *                 description: Radius of the bin location
 *                 example: 10
 *               locationObject:
 *                 type: object
 *                 description: GeoJSON Point object for bin location
 *                 required:
 *                   - type
 *                   - coordinates
 *                   - city
 *                   - country
 *                   - address
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [Point]
 *                     description: GeoJSON type (must be "Point")
 *                     example: "Point"
 *                   coordinates:
 *                     type: array
 *                     description: Array of [longitude, latitude]
 *                     items:
 *                       type: number
 *                     minItems: 2
 *                     maxItems: 2
 *                     example: [-74.0060, 40.7128]
 *                   city:
 *                     type: string
 *                     description: City of the bin location
 *                     example: "New York"
 *                   country:
 *                     type: string
 *                     description: Country of the bin location
 *                     example: "USA"
 *                   address:
 *                     type: string
 *                     description: Full address of the bin location
 *                     example: "123 Main St, New York, NY 10001"
 *               insurancefile:
 *                 type: string
 *                 description: URL or path to insurance document
 *                 example: "https://example.com/insurance/doc123.pdf"
 *               registrationfile:
 *                 type: string
 *                 description: URL or path to registration document
 *                 example: "https://example.com/registration/doc456.pdf"
 *               issue_date:
 *                 type: string
 *                 format: date
 *                 description: Registration issue date
 *                 example: "2024-01-15"
 *               expiry_date:
 *                 type: string
 *                 format: date
 *                 description: Registration expiry date
 *                 example: "2025-01-15"
 *               insurance_issue_date:
 *                 type: string
 *                 format: date
 *                 description: Insurance issue date
 *                 example: "2024-01-15"
 *               insurance_expiry_date:
 *                 type: string
 *                 format: date
 *                 description: Insurance expiry date
 *                 example: "2025-01-15"
 *               type:
 *                 type: string
 *                 description: Type of bin/dumpster
 *                 enum: [trailor, rolloff]
 *                 example: "rolloff"
 *               quantity:
 *                 type: number
 *                 description: Number of bins
 *                 minimum: 1
 *                 example: 2
 *               userId:
 *                 type: string
 *                 description: Optional user ID (auto-populated from authenticated user if not provided)
 *                 example: "60ae0d9f5b6c3c001c8f1234"
 *     responses:
 *       201:
 *         description: Bin created successfully
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
 *                   example: Bin created successfully
 *                 data:
 *                   type: object
 *                   description: Created bin object with all details
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
router.post("/", authenticate, validate(createBin), createBinController);

/**
 * @swagger
 * /api/bin/:
 *   get:
 *     summary: Get all bins
 *     description: Retrieve a list of all bins with optional filtering by search, status, date range, dumpster type, and location.
 *     tags: [Bin]
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
 *         description: Search by size or description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by bin status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter start date for bookings
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter end date for bookings
 *       - in: query
 *         name: dumbster
 *         schema:
 *           type: string
 *         description: Filter by dumpster ID
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: Latitude for location-based search
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         description: Longitude for location-based search
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 200000
 *         description: Radius in meters for location search
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [portaPotty, dumbster]
 *         description: Filter by type
 *         example: "portaPotty"
 *     responses:
 *       200:
 *         description: Bins fetched successfully
 *         content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   message:
 *                     type: string
 *                     example: Bins fetched successfully
 *                   data:
 *                     type: object
 *                     properties:
 *                       bins:
 *                         type: array
 *                         items:
 *                           type: object
 *                       total:
 *                         type: integer
 *                       page:
 *                         type: integer
 *                       limit:
 *                         type: integer
 *                       currentPageSize:
 *                         type: integer
 *                       totalPages:
 *                         type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticate, getAllBinsController);

/**
 * @swagger
 * /api/bin/{id}:
 *   put:
 *     summary: Update bin details
 *     description: Update an existing bin's information including location, documents, and specifications.
 *     tags: [Bin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bin ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dumbster:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [Point]
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *               address:
 *                 type: string
 *               insurancefile:
 *                 type: string
 *               registrationfile:
 *                 type: string
 *               issue_date:
 *                 type: string
 *                 format: date
 *               expiry_date:
 *                 type: string
 *                 format: date
 *               insurance_issue_date:
 *                 type: string
 *                 format: date
 *               insurance_expiry_date:
 *                 type: string
 *                 format: date
 *               type:
 *                 type: string
 *                 enum: [trailor, rolloff]
 *               quantity:
 *                 type: number
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bin updated successfully
 *         content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   message:
 *                     type: string
 *                     example: Bin updated successfully
 *                   data:
 *                     type: object
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put("/:id", authenticate, validate(updateBin), updateBinController);

/**
 * @swagger
 * /api/bin/{id}:
 *   delete:
 *     summary: Delete a bin
 *     description: Soft delete a bin by ID.
 *     tags: [Bin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bin ID
 *     responses:
 *       200:
 *         description: Bin deleted successfully
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
 *                   example: Bin deleted successfully
 *                 data:
 *                   type: object
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", authenticate, deleteBinController);

/**
 * @swagger
 * /api/bin/admin:
 *   get:
 *     summary: Admin - Get all bins
 *     description: Retrieve all bins with administrative filters (verification status, rejection, dates).
 *     tags: [Bin]
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
 *         name: verify
 *         schema:
 *           type: string
 *           enum: [true, false, all, pending]
 *         description: Filter by verification status
 *       - in: query
 *         name: rejected
 *         schema:
 *           type: string
 *           enum: [true]
 *         description: Filter by rejected status
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by city
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country
 *       - in: query
 *         name: insurance_expiry_date
 *         schema:
 *           type: string
 *           enum: [true]
 *         description: Sort by insurance expiry date descending
 *       - in: query
 *         name: expiry_date
 *         schema:
 *           type: string
 *           enum: [true]
 *         description: Sort by registration expiry date descending
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by User ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [portaPotty, dumbster]
 *         description: Filter by type
 *         example: "portaPotty"
 *     responses:
 *       200:
 *         description: Bins fetched successfully
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
 *                   example: Bin checked successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     bins:
 *                       type: array
 *                       items:
 *                         type: object
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalQuantity:
 *                       type: integer
 *                     currentPageSize:
 *                       type: integer
 *       500:
 *         description: Internal server error
 */

router.get("/admin", [authenticate, admin], adminSideBinController);
/**
 * @swagger
 * /api/bin/admin/{id}:
 *   post:
 *     summary: Admin - Create a bin for a user
 *     description: Admin creates a bin/dumpster for a specific user. This route increments the user's verifyCount and creates the bin entry.
 *     tags: [Bin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user for whom the bin is being created
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dumbster
 *               - location
 *               - address
 *               - insurancefile
 *               - registrationfile
 *               - type
 *               - quantity
 *             properties:
 *               dumbster:
 *                 type: string
 *                 example: "BIN-ADMIN-001"
 *               location:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [Point]
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                     example: [-74.0060, 40.7128]
 *               address:
 *                 type: string
 *                 example: "456 Admin Ave, New York, NY 10001"
 *               insurancefile:
 *                 type: string
 *                 example: "https://example.com/docs/ins.pdf"
 *               registrationfile:
 *                 type: string
 *                 example: "https://example.com/docs/reg.pdf"
 *               issue_date:
 *                 type: string
 *                 format: date
 *               expiry_date:
 *                 type: string
 *                 format: date
 *               insurance_issue_date:
 *                 type: string
 *                 format: date
 *               insurance_expiry_date:
 *                 type: string
 *                 format: date
 *               type:
 *                 type: string
 *                 enum: [trailor, rolloff]
 *               quantity:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Bin created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
router.post(
  "/admin/:id",
  [authenticate, admin],
  validate(createBin),
  createBinAdminSideController,
);
/**
 * @swagger
 * /api/bin/admin/check-bin:
 *   get:
 *     summary: Admin - Check bin stats
 *     description: Get statistics for bins (verified, pending, rejected) and pending support tickets.
 *     tags: [Bin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Stats fetched successfully
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
 *                   example: Bin checked successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     verify:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     reject:
 *                       type: integer
 *                     totalPendingSupports:
 *                       type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/admin/check-bin", [authenticate, admin], checkBinController);

/**
 * @swagger
 * /api/bin/admin/verify/{id}:
 *   put:
 *     summary: Admin - Verify or Reject Bin
 *     description: Verify or reject a bin submission. Requires admin privileges.
 *     tags: [Bin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bin ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 description: Status to set (e.g., 'reject' to reject, otherwise verifies)
 *                 example: "verify"
 *               reason:
 *                 type: string
 *                 description: Reason for rejection (required if status is reject)
 *                 example: "Documents incomplete"
 *     responses:
 *       200:
 *         description: Bin verified/rejected successfully
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
 *                   example: Bin verified successfully
 *                 data:
 *                   type: object
 *       500:
 *         description: Internal server error
 */
router.put("/admin/verify/:id", [authenticate, admin], verifyBinController);

export default router;
