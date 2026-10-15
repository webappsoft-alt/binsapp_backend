import express from "express";
import {
  addOperatorDriver,
  deleteOperatorDriver,
  sendDriverInvite,
  assignDriverToOrder,
  changeDriver,
  completeDelivery,
  completeOrderAssignUser,
  completePickup,
  completeSwap,
  createAssignOrder,
  deliveryProof,
  dispatchJob,
  driverArrived,
  driverEnRoute,
  dropoffOrder,
  getAssignOrder,
  getAssignOrderList,
  getAssignOrders,
  getAssignySubUser,
  getDriverJobDetails,
  getOperatorDrivers,
  getOperatorLiveDashboard,
  getSubusers,
  reportPickupIssue,
  updateLocation,
  updateOnItsWay,
  uploadPickupProof,
} from "./controller.js";
import { authenticate, subUser } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  createAssignOrderValidation,
  deliveryProofValidation,
  updateLocationValidation,
} from "./validation.js";

const router = express.Router();
/**
 * @swagger
 * tags:
 *   - name: Assign Order
 *     description: Order assignment to sub-users (drivers/labor)
 *   - name: Sub User
 *     description: Operations for sub-users (drivers/labor)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     SubUserDetail:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         phone:
 *           type: string
 *         email:
 *           type: string
 *         location:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               enum: [Point]
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *               example: [0, 0]
 *     AssignOrder:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         subUserDetail:
 *           $ref: '#/components/schemas/SubUserDetail'
 *         orderId:
 *           type: string
 *         assignBy:
 *           type: string
 *         status:
 *           type: string
 *           enum: [assigned, completed, cancel_request, cancelled]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/assign-order/createAssignOrder:
 *   post:
 *     summary: Assign an order to a sub-user
 *     description: Renter assigns an accepted order to a sub-user (e.g., driver).
 *     tags: [Assign Order]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subUserDetail, orderId]
 *             properties:
 *               subUserDetail:
 *                 type: object
 *                 required: [phone, name, email]
 *                 properties:
 *                   phone:
 *                     type: string
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order assigned successfully
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
 *                     details:
 *                       $ref: '#/components/schemas/AssignOrder'
 *                     token:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post(
  "/createAssignOrder",
  authenticate,
  validate(createAssignOrderValidation),
  createAssignOrder,
);
// ==========================================
// OPERATOR DRIVER MANAGEMENT & DISPATCH (Owner/Operator)
// ==========================================
router.get("/operator/drivers", authenticate, getOperatorDrivers);
router.post("/operator/drivers", authenticate, addOperatorDriver);
router.delete("/operator/drivers/:id", authenticate, deleteOperatorDriver);
router.post("/operator/send-driver-invite", authenticate, sendDriverInvite);
router.post("/operator/assign-driver", authenticate, assignDriverToOrder);
router.post("/operator/dispatch", authenticate, dispatchJob);
router.post("/operator/change-driver", authenticate, changeDriver);
router.get("/operator/live-dashboard", authenticate, getOperatorLiveDashboard);

/**
 * @swagger
 * /api/assign-order/getAssignySubUser:
 *   get:
 *     summary: Get all sub-users assigned by the authenticated renter
 *     description: Retrieves a list of all sub-users (drivers/labor) who have been assigned to any order by the authenticated renter.
 *     tags: [Assign Order]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sub-users fetched successfully
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
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SubUserDetail'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/getAssignySubUser", authenticate, getAssignySubUser);

/**
 * @swagger
 * /api/assign-order/map:
 *   get:
 *     summary: Get all assigned orders for a renter
 *     description: Retrieves all active orders currently assigned to sub-users by the authenticated renter. This is typically used for a map view.
 *     tags: [Assign Order]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Assigned orders fetched successfully
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
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AssignOrder'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/map", authenticate, getAssignOrders);
/**
 * @swagger
 * /api/assign-order/history:
 *   get:
 *     summary: Get history of assigned sub-users with pagination
 *     description: Retrieves a deduplicated history of sub-users assigned by the authenticated user.
 *     tags: [Assign Order]
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
 *     responses:
 *       200:
 *         description: Assigned sub-users fetched successfully
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
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SubUserDetail'
 */
router.get("/history", authenticate, getSubusers);

/**
 * @swagger
 * /api/assign-order/getAssignOrder/{id}:
 *   get:
 *     summary: Fetch assigned order details
 *     description: Retrieves the details of an assigned order and generates an access token for the sub-user.
 *     tags: [Assign Order]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the assigned order
 *     responses:
 *       200:
 *         description: Assigned order fetched successfully
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
 *                     details:
 *                       $ref: '#/components/schemas/AssignOrder'
 *                     token:
 *                       type: string
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get("/getAssignOrder/:id", getAssignOrder);

router.use(subUser);

/**
 * @swagger
 * /api/assign-order/updateOnItsWay:
 *   post:
 *     summary: Mark order as on its way
 *     description: Sub-user marks the assigned order as being on its way.
 *     tags: [Sub User]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Order status updated to on its way
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post("/updateOnItsWay", updateOnItsWay);

/**
 * @swagger
 * /api/assign-order/updateLocation:
 *   post:
 *     summary: Update sub-user live location
 *     description: Updates the live GPS coordinates of the sub-user.
 *     tags: [Sub User]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentlat, currentlng]
 *             properties:
 *               currentlat:
 *                 type: number
 *               currentlng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated successfully
 */
router.post(
  "/updateLocation",
  validate(updateLocationValidation),
  updateLocation,
);
/**
 * @swagger
 * /api/assign-order/completeOrderAssignUser:
 *   post:
 *     summary: Mark assigned order as completed
 *     description: Sub-user marks the assigned order as completed. This process updates the order status, handles Stripe transfers to the renter, and sends notifications.
 *     tags: [Sub User]
 *     security:
 *       - BearerAuth: []
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
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post("/completeOrderAssignUser", completeOrderAssignUser);

/**
 * @swagger
 * /api/assign-order/dropoffOrder:
 *   post:
 *     summary: Mark order as dropped off
 *     description: Sub-user marks the assigned order as dropped off. The order reference is automatically identified from the sub-user's token.
 *     tags: [Sub User]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dropoffimage]
 *             properties:
 *               dropoffimage:
 *                 type: string
 *                 description: URL of the image showing the dumpster at the drop-off location
 *     responses:
 *       200:
 *         description: Order dropped off successfully
 *       400:
 *         description: Invalid request or order status
 *       404:
 *         description: Order not found
 */
router.post("/dropoffOrder", dropoffOrder);

/**
 * @swagger
 * /api/assign-order/driver/delivery-proof:
 *   post:
 *     summary: Submit delivery proof of work
 *     description: Sub-user (driver) submits photo proof that the assigned delivery was completed. Photos are stored on the order as proofOfWorkDone. Order ID comes from the x-order-id header, same as other driver endpoints.
 *     tags: [Sub User]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-order-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID (same header used by other driver endpoints)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proofOfWorkDone]
 *             properties:
 *               proofOfWorkDone:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example:
 *                   - https://example.com/photo1.jpg
 *                   - https://example.com/photo2.jpg
 *     responses:
 *       200:
 *         description: Delivery proof submitted successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post(
  "/driver/delivery-proof",
  validate(deliveryProofValidation),
  deliveryProof,
);

/**
 * @swagger
 * /api/assign-order/getAssignOrderList:
 *   get:
 *     summary: Get list of assigned orders for sub-user
 *     description: Retrieves a paginated list of orders assigned to the authenticated sub-user.
 *     tags: [Sub User]
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
 *     responses:
 *       200:
 *         description: Assigned orders fetched successfully
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
 *                     assignOrderList:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AssignOrder'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get("/getAssignOrderList", getAssignOrderList);
// ==========================================
// DRIVER WORKFLOW EXECUTION (Driver/SubUser or Owner acting as driver)
// ==========================================
router.get("/driver/job-details/:orderId", getDriverJobDetails);
router.post("/driver/en-route", driverEnRoute);
router.post("/driver/arrived", driverArrived);
router.post("/driver/complete-delivery", completeDelivery);
router.post("/driver/pickup-proof", uploadPickupProof);
router.post("/driver/report-issue", reportPickupIssue);
router.post("/driver/complete-pickup", completePickup);
router.post("/driver/complete-swap", completeSwap);
export default router;
