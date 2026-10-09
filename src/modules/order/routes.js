import express from "express";
import { completeOrderSchema, renteeOrderSchema } from "./validation.js";
import {
  fetchrequestOrder,
  renterStats,
  renteeOrder,
  completeOrder,
  updateOnItsWay,
  fetchRenterOrder,
  fetchrequestOrderRentee,
  getRenteeOrderById,
  deleteRenterOrder,
  checkRate,
  adminOrder,
  adminCancelRequestUpdate,
  adminRefunedRequestUpdate,
  adminTransferRequestUpdate,
  renterCheckRate,
  getOrderTimeline,
  getOrderLiveLocation,
  adminDeleteOrder,
  recordOrderWeight,
  updateSwapStatusRenter,
  getAdminManualReviewRequest,
  updateAdminManualReviewRequest,
} from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
const router = express.Router();
/**
 * @swagger
 * /api/order/renter/timeline/{id}:
 *   get:
 *     summary: Get order timeline (Renter)
 *     description: Retrieves the historical events/timeline for a specific order.
 *     tags: [Renter Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order
 *     responses:
 *       200:
 *         description: Order timeline fetched successfully
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
 *                   example: Order timeline fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderTimeline'
 *       500:
 *         description: Internal server error
 */
router.get("/renter/timeline/:id", getOrderTimeline);
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   - name: Renter Order
 *     description: Order management operations for renters (service providers)
 *   - name: Rentee Order
 *     description: Order management operations for rentees (customers)
 *   - name: Admin Order
 *     description: Order management operations for admin
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 60ae0d9f5b6c3c001c8f1234
 *         user:
 *           type: string
 *           description: ID of the user who placed the order
 *         dumbster:
 *           type: string
 *           description: ID of the dumbster
 *         start_date:
 *           type: string
 *           format: date-time
 *         end_date:
 *           type: string
 *           format: date-time
 *         price:
 *           type: number
 *         status:
 *           type: string
 *           enum: [pending, accepted, completed, cancelled]
 *         onway:
 *           type: boolean
 *         address:
 *           type: string
 *     OrderTimeline:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 60ae0d9f5b6c3c001c8f1234
 *         order:
 *           type: string
 *           description: ID of the associated order
 *         orderDeatil:
 *           type: object
 *           description: Snapshot of order details at the time of event
 *         message:
 *           type: string
 *           example: "Order completed successfully!"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/order/renter:
 *   get:
 *     summary: Get renter orders
 *     description: Retrieve orders assigned to the authenticated renter. Supports filtering by status (all, pending, accepted, completed, cancelled).
 *     tags: [Renter Order]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, pending, accepted, completed, cancelled]
 *           default: all
 *         description: Filter by order status
 *     responses:
 *       200:
 *         description: Orders fetched successfully
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
 *                   example: Orders fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Order'
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/renter", fetchRenterOrder);

/**
 * @swagger
 * /api/order/renter/request:
 *   get:
 *     summary: Get user orders
 *     description: Retrieve orders for the authenticated user, optionally filtered by status and pagination.
 *     tags: [Renter Order]
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
 *         name: status
 *         schema:
 *           type: string
 *           default: pending
 *         description: Filter by order status
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/renter/request", fetchrequestOrder);

/**
 * @swagger
 * /api/order/renter/request/{id}:
 *   get:
 *     summary: Get user orders with cursor
 *     description: Retrieve orders older than the specified ID, useful for cursor-based pagination.
 *     tags: [Renter Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cursor ID (Fetch orders created before this ID)
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
 *         name: status
 *         schema:
 *           type: string
 *           default: pending
 *         description: Filter by order status
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/renter/request/:id", fetchrequestOrder);

/**
 * @swagger
 * /api/order/renter/stats:
 *   get:
 *     summary: Get renter order statistics
 *     description: Retrieve statistics for the authenticated renter, including counts of pending, accepted, and completed orders, as well as total earnings.
 *     tags: [Renter Order]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Renter statistics fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     completeOrder:
 *                       type: integer
 *                       description: Total number of completed orders
 *                       example: 10
 *                     acceptedOrder:
 *                       type: integer
 *                       description: Total number of accepted orders
 *                       example: 5
 *                     pendingOrder:
 *                       type: integer
 *                       description: Total number of pending orders
 *                       example: 2
 *                     totalEarning:
 *                       type: number
 *                       description: Total earnings from completed orders
 *                       example: 1500.50
 *       500:
 *         description: Internal server error
 */
router.get("/renter/stats", renterStats);

/**
 * @swagger
 * /api/order/renter/checkRate:
 *   get:
 *     summary: Check for unrated completed orders
 *     description: Checks if there is a completed order for the user that hasn't been rated yet.
 *     tags: [Renter Order]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Rate checked successfully
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
 *                   example: Rate checked successfully
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.get("/renter/checkRate", renterCheckRate);

/**
 * @swagger
 * /api/order/renter/update/{id}:
 *   put:
 *     summary: Complete an order
 *     description: Update an order status to 'completed'. The order must be currently in 'accepted' status and associated with the authenticated renter.
 *     tags: [Renter Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [completed]
 *                 description: New status of the order
 *     responses:
 *       200:
 *         description: Order completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put("/renter/update/:id", validate(completeOrderSchema), completeOrder);

/**
 * @swagger
 * /api/order/rentee:
 *   get:
 *     summary: Get rentee orders
 *     description: Retrieve orders for the authenticated rentee. Can filter by status and optionally by another user ID.
 *     tags: [Rentee Order]
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
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, pending, accepted, completed, cancelled]
 *         description: Order status filter
 *       - in: query
 *         name: otherId
 *         schema:
 *           type: string
 *         description: Optional User ID to filter orders for (overrides authenticated user ID search)
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       400:
 *         description: Invalid status
 *       500:
 *         description: Internal server error
 */
router.get("/rentee", renteeOrder);

/**
 * @swagger
 * /api/order/rentee/manual-review-request:
 *   get:
 *     summary: Get rentee manual review requests
 *     description: Retrieve manual review requests for authenticated user . Can filter by status and optionally by another user ID.
 *     tags: [Rentee Order]
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
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, pending, accepted, completed, cancelled]
 *         description: Order status filter
 *       - in: query
 *         name: otherId
 *         schema:
 *           type: string
 *         description: Optional User ID to filter orders for (overrides authenticated user ID search)
 *     responses:
 *       200:
 *         description: Manual review requests fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 adminManualReviewRequests:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       400:
 *         description: Invalid status
 *       500:
 *         description: Internal server error
 */
router.get("/rentee/manual-review-request", getAdminManualReviewRequest);

/**
 * @swagger
 * /api/order/rentee/manual-review-request/{id}:
 *   put:
 *     summary: Update manual review request
 *     description: Update manual review request by ID
 *     tags: [Rentee Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Manual review request ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, accepted, completed, cancelled]
 *                 description: Manual review request status
 *             required:
 *               - status
 *     responses:
 *       200:
 *         description: Manual review request updated successfully
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
 *                   properties:
 *                     adminManualReviewRequest:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         userId:
 *                           type: string
 *                         quoteId:
 *                           type: string
 *                         image:
 *                           type: string
 *                         height_inch:
 *                           type: number
 *                         diameter_inch:
 *                           type: number
 *                         quote_adjustment:
 *                           type: number
 *                         status:
 *                           type: string
 *                         is_auto_quoted:
 *                           type: boolean
 *                         manual_review_note:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/rentee/manual-review-request/:id", updateAdminManualReviewRequest);

/**
 * @swagger
 * /api/order/rentee/request:
 *   get:
 *     summary: Get rentee orders
 *     description: Retrieve orders for the authenticated rentee, optionally filtered by status and pagination.
 *     tags: [Rentee Order]
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
 *         name: status
 *         schema:
 *           type: string
 *           default: pending
 *         description: Filter by order status
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/order/rentee/request:
 *   get:
 *     summary: Get rentee order requests
 *     description: Retrieve pending orders/requests for the authenticated rentee. Supports filtering by status.
 *     tags: [Rentee Order]
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
 *         name: status
 *         schema:
 *           type: string
 *           default: pending
 *         description: Filter by order status
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/rentee/request", fetchrequestOrderRentee);

/**
 * @swagger
 * /api/order/rentee/checkRate:
 *   get:
 *     summary: Check for unrated completed orders
 *     description: Checks if there is a completed order for the user that hasn't been rated yet.
 *     tags: [Rentee Order]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Rate checked successfully
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
 *                   example: Rate checked successfully
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.get("/rentee/checkRate", checkRate);
/**
 * @swagger
 * /api/order/rentee/timeline/{id}:
 *   get:
 *     summary: Get order timeline (Rentee)
 *     description: Retrieves the historical events/timeline for a specific order.
 *     tags: [Rentee Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order
 *     responses:
 *       200:
 *         description: Order timeline fetched successfully
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
 *                   example: Order timeline fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderTimeline'
 *       500:
 *         description: Internal server error
 */
router.get("/rentee/timeline/:id", getOrderTimeline);
router.get("/rentee/order/:id", getRenteeOrderById);
/**
 * @swagger
 * /api/order/rentee/order/{id}:
 *   delete:
 *     summary: Delete a rentee Order
 *     description: Deletes a specific order request made by the authenticated rentee. The request must belong to the user.
 *     tags: [Rentee Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the request to delete
 *     responses:
 *       200:
 *         description: Request deleted successfully
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
 *                   example: Request deleted successfully
 *                 data:
 *                   type: object
 *                   description: The deleted request object
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.delete("/rentee/order/:id", deleteRenterOrder);

/**
 * @swagger
 * /api/order/onWay/{id}:
 *   put:
 *     summary: Set order on its way
 *     description: Updates the order to indicate it is on its way to the drop-off location. Only the assigned renter can trigger this.
 *     tags: [Renter Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order
 *     responses:
 *       200:
 *         description: Order set on its way successfully
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
 *                   example: You have set order on its way to dropoff location.
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Order is already set on its way!
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put("/onWay/:id", updateOnItsWay);

/** Operator records actual tonnage at pickup (commercial orders). */
router.post("/renter/:id/weight", recordOrderWeight);
/** Operator updates swap status on a commercial order. */
router.put("/renter/:id/swap-request", updateSwapStatusRenter);

/**
 * @swagger
 * /api/order/{id}/live-location:
 *   get:
 *     summary: Get the latest driver/dumpster coordinates for an order
 *     description: Seeds the tracking map if a live `location-update` socket event was missed. Accessible to the order's customer or owner only.
 *     tags: [Rentee Order]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order live location fetched successfully
 */
router.get("/:id/live-location", getOrderLiveLocation);

/**
 * @swagger
 * /api/order/admin:
 *   get:
 *     summary: Admin Get Orders
 *     description: Fetches a list of orders based on status with pagination. Requires admin authentication.
 *     tags: [Admin Order]
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
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter orders by customer ID
 *       - in: query
 *         name: ownerId
 *         schema:
 *           type: string
 *         description: Filter orders by owner ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, completed, cancelled]
 *           default: pending
 *         description: Filter orders by status
 *     responses:
 *       200:
 *         description: Orders fetched successfully
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
 *                   example: Orders fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Order'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/admin", admin, adminOrder);

/**
 * @swagger
 * /api/order/admin/cancel/{id}:
 *   put:
 *     summary: Admin update cancellation request
 *     description: Admin can accept or reject an order cancellation request. If accepted, a refund is processed and notifications are sent.
 *     tags: [Admin Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [accepted, rejected]
 *                 example: accepted
 *     responses:
 *       200:
 *         description: Request updated successfully
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
 *                   example: Request updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     findOrder:
 *                       $ref: '#/components/schemas/Order'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put("/admin/cancel/:id", admin, adminCancelRequestUpdate);

/**
 * @swagger
 * /api/order/admin/refund/{id}:
 *   put:
 *     summary: Admin refund order
 *     description: Manually marks an order as refunded by admin. Requires admin authentication.
 *     tags: [Admin Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order
 *     responses:
 *       200:
 *         description: Refund successful
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
 *                   example: Request updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put("/admin/refund/:id", admin, adminRefunedRequestUpdate);

/**
 * @swagger
 * /api/order/admin/transfer/{id}:
 *   put:
 *     summary: Admin transfer payment to renter
 *     description: Manually marks the payment as transferred to the renter by admin. Requires admin authentication.
 *     tags: [Admin Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order
 *     responses:
 *       200:
 *         description: Transfer successful
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
 *                   example: Request updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put("/admin/transfer/:id", admin, adminTransferRequestUpdate);

/**
 * @swagger
 * /api/order/admin/delete/{id}:
 *   delete:
 *     summary: Admin delete order
 *     description: Deletes a specific order by ID and all its associated requests. Requires admin authentication.
 *     tags: [Admin Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order to delete
 *     responses:
 *       200:
 *         description: Order deleted successfully
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
 *                   example: Order deleted successfully
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.delete("/admin/delete/:id", admin, adminDeleteOrder);

/**
 * @swagger
 * /api/order/admin/timeline/{id}:
 *   get:
 *     summary: Get order timeline (Admin)
 *     description: Retrieves the historical events/timeline for a specific order.
 *     tags: [Admin Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the order
 *     responses:
 *       200:
 *         description: Order timeline fetched successfully
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
 *                   example: Order timeline fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderTimeline'
 *       500:
 *         description: Internal server error
 */
router.get("/admin/timeline/:id", admin, getOrderTimeline);
export default router;
