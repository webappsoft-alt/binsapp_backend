import {
  adminLogin,
  adminDashboard,
  adminDeleteUser,
  adminUpdateUser,
  adminSendEmail,
  getAllUsers,
  adminSendNotifications,
  getDashBoardUsersStats,
  getDashBoardUsersGraphData,
  getDashBoardDumpstersGraphData,
  sendPushNotificationViaFCM,
  updateJunkService,
  updateTreeService,
  deleteJunkService,
  deleteTreeService,
  deleteCompanyService,
  approveCompanyService,
  rejectCompanyService,
  updateCompanyStatus,
  getAllJunkRemoval,
  getAllTreeRemoval,
  upsertCompanyPricingPlan,
  getCompanyPricingPlan,
  deleteCompanyPricingPlan,
  setCompanyCommercialConfig,
  adminListCompanyBilling,
  adminMarkInvoicePaid,
  getAdminManualReviewRequests,
  getAdminManualReviewRequestById,
  updateAdminManualReviewRequests,
  deleteAdminManualReviewRequests,
  getUserByService,
} from "./controller.js";
import {
  getJunkRemovalConfig,
  upsertJunkRemovalConfig,
} from "./junkRemovalConfig.controller.js";
import { Router } from "express";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  loginSchema,
  updateSchema,
  sendEmailSchema,
  updateServiceStatusSchema,
  approveCompanySchema,
  rejectCompanySchema,
  adminUpdateManualReviewRequestsSchema,
} from "./validation.js";
import {
  createCompanyValidation,
  pricingPlanValidation,
  companyConfigValidation,
} from "../company/validation.js";
import {
  listLeads as adminListLeads,
  updateLead as adminUpdateLead,
} from "../leads/controller.js";
import {
  adminApplyPenalty as adminGrowthApplyPenalty,
  adminRemovePenalty as adminGrowthRemovePenalty,
  adminListApplications as adminGrowthListApplications,
  adminListCatalog as adminGrowthListCatalog,
  adminListOperators as adminGrowthListOperators,
  createCatalogItem as adminGrowthCreateCatalog,
  decideApplication as adminGrowthDecideApplication,
  deleteCatalogItem as adminGrowthDeleteCatalog,
  getGrowthConfig as adminGetGrowthConfig,
  overrideOperator as adminGrowthOverrideOperator,
  setDumbsterBranded as adminSetDumbsterBranded,
  updateCatalogItem as adminGrowthUpdateCatalog,
  updateGrowthConfig as adminUpdateGrowthConfig,
} from "../growth/controller.js";
import {
  applicationDecisionSchema,
  brandedDumbsterSchema,
  catalogItemSchema,
  catalogItemUpdateSchema,
  growthConfigSchema,
  operatorOverrideSchema,
  penaltySchema,
  removePenaltySchema,
} from "../growth/validation.js";

const router = Router();

/**
 * @swagger
 * tags:
 *  name: Admin
 *  description: Admin Routes
 */

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Admin Login
 *     description: Authenticate an admin user and return tokens.
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Admin logged in successfully
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
 *                   example: Admin logged in successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/AuthUser'
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post("/login", validate(loginSchema), adminLogin);

router.use([authenticate, admin]);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get All Users
 *     description: Fetches all users with optional filtering and pagination.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter users by type (e.g., 'rentee', 'renter', 'all')
 *       - in: query
 *         name: bins
 *         schema:
 *           type: string
 *         description: Filter users by bin status (e.g., 'pending', 'verify', 'reject')
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query for user fields (name, email, phone)
 *       - in: query
 *         name: isStripeConnected
 *         schema:
 *           type: boolean
 *         description: Filter users by stripe account connection (true/false)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         example: 2026-05-01
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         example: 2026-06-01
 *         description: End date for filtering
 *     responses:
 *       200:
 *         description: Users fetched successfully
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
 *                   example: Users fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AuthUser'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         totalUsers:
 *                           type: integer
 *                           example: 100
 *                         totalPages:
 *                           type: integer
 *                           example: 10
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/users", getAllUsers);

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get Admin Dashboard Data
 *     description: Fetches statistics and graph data for the admin dashboard. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard data fetched successfully
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
 *                   example: Admin dashboard data fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: integer
 *                     totalRenterUsers:
 *                       type: integer
 *                     totalDustbins:
 *                       type: integer
 *                     totalQuantity:
 *                       type: number
 *                     totalOrder:
 *                       type: array
 *                       items:
 *                         type: object
 *                     thismothOrder:
 *                       type: array
 *                       items:
 *                         type: object
 *                     newGraph:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           x:
 *                             type: string
 *                             example: "Jan"
 *                           y:
 *                             type: integer
 *                           price:
 *                             type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/dashboard", adminDashboard);

/**
 * @swagger
 * /api/admin/delete-user/{id}:
 *   delete:
 *     summary: Delete User
 *     description: Soft deletes a user by changing their status to "deleted" and deactivating their dustbins. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
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
 *                   example: User deleted successfully
 *                 data:
 *                   $ref: '#/components/schemas/AuthUser'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete("/delete-user/:id", adminDeleteUser);

/**
 * @swagger
 * /api/admin/update-user/{id}:
 *   put:
 *     summary: Update User
 *     description: Updates user information. Only provided fields will be updated. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to update
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Doe
 *               comp_name:
 *                 type: string
 *                 example: Bins Corp
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane@example.com
 *               phone:
 *                 type: string
 *                 example: "+10987654321"
 *               status:
 *                 type: string
 *                 enum: [active, inactive, deleted]
 *                 example: active
 *               role:
 *                 type: string
 *                 enum: [admin, renter, user]
 *                 example: renter
 *     responses:
 *       200:
 *         description: User updated successfully
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
 *                   example: User updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/AuthUser'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put("/update-user/:id", validate(updateSchema), adminUpdateUser);

/**
 * @swagger
 * /api/admin/send-email:
 *   post:
 *     summary: Admin Send Email
 *     description: Sends a custom email to a specific email address. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, subject, html]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               subject:
 *                 type: string
 *                 example: Support Ticket Update
 *               html:
 *                 type: string
 *                 example: "<h1>Update</h1><p>Your ticket has been resolved.</p>"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: Email sent successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post("/send-email", validate(sendEmailSchema), adminSendEmail);

/**
 * @swagger
 * /api/admin/send-notification:
 *   post:
 *     summary: Send Notifications
 *     description: Sends notifications to users based on type. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, rentee, renter, users]
 *         description: The type of users to send notifications to.
 *       - in: query
 *         name: supportId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional ID for support context.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "New Feature Alert!"
 *               description:
 *                 type: string
 *                 example: "Check out our new and improved features."
 *               users:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of user IDs to send notifications to (required if type is 'users').
 *     responses:
 *       200:
 *         description: Notifications sent successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post("/send-notification", adminSendNotifications);

/**
 * @swagger
 * /api/admin/get-dashboard-users-graph-data:
 *   get:
 *     summary: Get Dashboard Users Graph Data
 *     description: Retrieves users graph data based on filter and type. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filter
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, rentee, renter]
 *         description: The filter to apply to the users data.
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, rentee, renter]
 *         description: The type of users to retrieve data for.
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: 2026-05-01
 *         description: The start date for the graph data.
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: 2026-06-01
 *         description: The end date for the graph data.
 *     responses:
 *       200:
 *         description: Dashboard users graph data fetched successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/get-dashboard-users-graph-data", getDashBoardUsersGraphData);

/**
 * @swagger
 * /api/admin/get-dashboard-users-stats:
 *   get:
 *     summary: Get Dashboard Users Stats
 *     description: Retrieves users stats based on filter and type. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, rentee, renter]
 *         description: The type of users to retrieve stats for.
 *     responses:
 *       200:
 *         description: Dashboard users stats fetched successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/get-dashboard-users-stats", getDashBoardUsersStats);
/**
 * @swagger
 * /api/admin/get-dashboard-dumpsters-graph-data:
 *   get:
 *     summary: Get Dashboard Dumpsters Graph Data
 *     description: Retrieves dumpsters graph data based on filter and type. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filter
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, rentee, renter]
 *         description: The filter to apply to the dumpsters data.
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: 2026-05-01
 *         description: The start date for the graph data.
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: 2026-06-01
 *         description: The end date for the graph data.
 *     responses:
 *       200:
 *         description: Dashboard dumpsters graph data fetched successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  "/get-dashboard-dumpsters-graph-data",
  getDashBoardDumpstersGraphData,
);

/**
 * @swagger
 * /api/admin/send-push-notification-via-fcm:
 *   post:
 *     summary: Send Push Notification Via FCM
 *     description: Sends push notifications to users via FCM. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcmToken, title, description]
 *             properties:
 *               fcmToken:
 *                 type: string
 *                 example: ""
 *               title:
 *                 type: string
 *                 example: "New Feature Alert!"
 *               description:
 *                 type: string
 *                 example: "Check out our new and improved features."
 *     responses:
 *       200:
 *         description: Push notification sent successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post("/send-push-notification-via-fcm", sendPushNotificationViaFCM);

/**
 * @swagger
 * /api/admin/get-all-junk-removal:
 *   get:
 *     summary: Get All Junk Removal Requests
 *     description: Fetches all junk removal service requests with optional search, status filtering, and pagination. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
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
 *         description: Search query for matching user's name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter requests by status
 *     responses:
 *       200:
 *         description: Junk removal requests fetched successfully
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
 *                   example: Junk removal fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     junkRemoval:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "60d5ec386f6e3c3b58f8b8a1"
 *                           companyName:
 *                             type: string
 *                             example: "Junk Busters"
 *                           legalBusinessName:
 *                             type: string
 *                             example: "Junk Busters LLC"
 *                           sameDayAvailable:
 *                             type: boolean
 *                             example: true
 *                           ein:
 *                             type: string
 *                             example: "12-3456789"
 *                           drivers_license:
 *                             type: array
 *                             items:
 *                               type: string
 *                             example: ["https://example.com/license.jpg"]
 *                           isDriversLicenseApproved:
 *                             type: boolean
 *                             example: true
 *                           drivers_license_note:
 *                             type: string
 *                             example: "Verified"
 *                           ownerFullName:
 *                             type: string
 *                             example: "John Doe"
 *                           email:
 *                             type: string
 *                             example: "john@example.com"
 *                           location:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 example: "Point"
 *                               coordinates:
 *                                 type: array
 *                                 items:
 *                                   type: number
 *                                 example: [-122.4194, 37.7749]
 *                           address:
 *                             type: string
 *                             example: "123 Main St"
 *                           city:
 *                             type: string
 *                             example: "San Francisco"
 *                           state:
 *                             type: string
 *                             example: "CA"
 *                           zip:
 *                             type: string
 *                             example: "94103"
 *                           country:
 *                             type: string
 *                             example: "USA"
 *                           COI:
 *                             type: string
 *                             example: "https://example.com/coi.pdf"
 *                           isCOIAApproved:
 *                             type: boolean
 *                             example: true
 *                           COI_note:
 *                             type: string
 *                             example: "Verified"
 *                           Business_license:
 *                             type: string
 *                             example: "https://example.com/license.pdf"
 *                           isBusinessLicenseApproved:
 *                             type: boolean
 *                             example: true
 *                           Business_license_note:
 *                             type: string
 *                             example: "Verified"
 *                           minimum_insurance_amount:
 *                             type: string
 *                             example: "1000000"
 *                           status:
 *                             type: string
 *                             example: "approved"
 *                           notes:
 *                             type: string
 *                             example: "Verified all documents"
 *                           userId:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "60d5ec386f6e3c3b58f8b8a0"
 *                               name:
 *                                 type: string
 *                                 example: "John Doe"
 *                               email:
 *                                 type: string
 *                                 example: "john@example.com"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-06-09T12:00:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-06-09T12:00:00.000Z"
 *                     total:
 *                       type: integer
 *                       example: 1
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     currentPageSize:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 1
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/get-all-junk-removal", getAllJunkRemoval);

/**
 * @swagger
 * /api/admin/get-all-tree-removal:
 *   get:
 *     summary: Get All Tree Removal Requests
 *     description: Fetches all tree removal service requests with optional search, status filtering, and pagination. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
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
 *         description: Search query for matching user's name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter requests by status
 *     responses:
 *       200:
 *         description: Tree removal requests fetched successfully
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
 *                   example: Tree removal fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     treeRemoval:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "60d5ec386f6e3c3b58f8b8b1"
 *                           companyName:
 *                             type: string
 *                             example: "Tree Cutters"
 *                           legalBusinessName:
 *                             type: string
 *                             example: "Tree Cutters LLC"
 *                           sameDayAvailable:
 *                             type: boolean
 *                             example: false
 *                           ein:
 *                             type: string
 *                             example: "98-7654321"
 *                           drivers_license:
 *                             type: array
 *                             items:
 *                               type: string
 *                             example: ["https://example.com/license.jpg"]
 *                           isDriversLicenseApproved:
 *                             type: boolean
 *                             example: true
 *                           drivers_license_note:
 *                             type: string
 *                             example: "Verified"
 *                           ownerFullName:
 *                             type: string
 *                             example: "Jane Smith"
 *                           location:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 example: "Point"
 *                               coordinates:
 *                                 type: array
 *                                 items:
 *                                   type: number
 *                                 example: [-122.4194, 37.7749]
 *                           address:
 *                             type: string
 *                             example: "456 Oak St"
 *                           city:
 *                             type: string
 *                             example: "San Francisco"
 *                           state:
 *                             type: string
 *                             example: "CA"
 *                           zip:
 *                             type: string
 *                             example: "94103"
 *                           country:
 *                             type: string
 *                             example: "USA"
 *                           radius:
 *                             type: number
 *                             example: 25
 *                           COI:
 *                             type: string
 *                             example: "https://example.com/coi.pdf"
 *                           License_Type:
 *                             type: string
 *                             example: "Arborist"
 *                           License_Number:
 *                             type: string
 *                             example: "ARB-12345"
 *                           License_State:
 *                             type: string
 *                             example: "CA"
 *                           License_Expiration:
 *                             type: string
 *                             format: date-time
 *                             example: "2027-12-31T00:00:00.000Z"
 *                           Tree_removal_license:
 *                             type: string
 *                             example: "https://example.com/tree_license.pdf"
 *                           isTreeRemovalLicenseApproved:
 *                             type: boolean
 *                             example: true
 *                           Tree_removal_license_note:
 *                             type: string
 *                             example: "Verified"
 *                           Workers_comp:
 *                             type: string
 *                             example: "https://example.com/workers_comp.pdf"
 *                           isWorkersCompApproved:
 *                             type: boolean
 *                             example: true
 *                           Workers_comp_note:
 *                             type: string
 *                             example: "Verified"
 *                           isArboristCredentialApproved:
 *                             type: boolean
 *                             example: true
 *                           Certified_arborist:
 *                             type: boolean
 *                             example: true
 *                           Certified_arborist_note:
 *                             type: string
 *                             example: "Verified"
 *                           Arborist_credential:
 *                             type: string
 *                             example: "https://example.com/arborist_cred.pdf"
 *                           status:
 *                             type: string
 *                             example: "approved"
 *                           notes:
 *                             type: string
 *                             example: "Verified all documents"
 *                           userId:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "60d5ec386f6e3c3b58f8b8b0"
 *                               name:
 *                                 type: string
 *                                 example: "Jane Smith"
 *                               email:
 *                                 type: string
 *                                 example: "jane@example.com"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-06-09T12:00:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-06-09T12:00:00.000Z"
 *                     total:
 *                       type: integer
 *                       example: 1
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     currentPageSize:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 1
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get("/get-all-tree-removal", getAllTreeRemoval);

/**
 * @swagger
 * /api/admin/update-junk-removal-status/{id}:
 *   put:
 *     summary: Update Junk Removal Status
 *     description: Updates the status and document approvals of a junk removal service request and sends an email to the user. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the junk removal record
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isDriversLicenseApproved:
 *                 type: boolean
 *                 description: Approval status of the driver's license
 *                 example: true
 *               drivers_license_note:
 *                 type: string
 *                 description: Admin note regarding driver's license
 *                 example: "Driver's license is valid and verified."
 *               isCOIAApproved:
 *                 type: boolean
 *                 description: Approval status of the COI (Certificate of Insurance)
 *                 example: true
 *               COI_note:
 *                 type: string
 *                 description: Admin note regarding COI
 *                 example: "COI matches all requirements."
 *               isBusinessLicenseApproved:
 *                 type: boolean
 *                 description: Approval status of the business license
 *                 example: true
 *               Business_license_note:
 *                 type: string
 *                 description: Admin note regarding business license
 *                 example: "Business license verified."
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected]
 *                 description: The overall application status
 *                 example: approved
 *               notes:
 *                 type: string
 *                 description: Overall admin notes or reason for rejection
 *                 example: "All documents look great, application approved!"
 *           examples:
 *             approved:
 *               summary: Approved Example
 *               value:
 *                 isDriversLicenseApproved: true
 *                 drivers_license_note: "Driver's license is valid."
 *                 isCOIAApproved: true
 *                 COI_note: "COI matches requirements."
 *                 isBusinessLicenseApproved: true
 *                 Business_license_note: "Business license verified."
 *                 status: approved
 *                 notes: "Everything looks good!"
 *             rejected:
 *               summary: Rejected Example
 *               value:
 *                 isDriversLicenseApproved: false
 *                 drivers_license_note: "Driver's license is expired. Please update it."
 *                 isCOIAApproved: true
 *                 COI_note: "COI matches requirements."
 *                 isBusinessLicenseApproved: false
 *                 Business_license_note: "Business license has incorrect company name."
 *                 status: rejected
 *                 notes: "Please update the expired driver's license and correct the business license company name."
 *     responses:
 *       200:
 *         description: Junk service updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put(
  "/update-junk-removal-status/:id",
  validate(updateServiceStatusSchema),
  updateJunkService,
);

/**
 * @swagger
 * /api/admin/update-tree-removal-status/{id}:
 *   put:
 *     summary: Update Tree Removal Status
 *     description: Updates the status and document approvals of a tree removal service request and sends an email to the user. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tree removal record
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isDriversLicenseApproved:
 *                 type: boolean
 *                 description: Approval status of the driver's license
 *                 example: true
 *               drivers_license_note:
 *                 type: string
 *                 description: Admin note regarding driver's license
 *                 example: "Driver's license is valid and verified."
 *               isTreeRemovalLicenseApproved:
 *                 type: boolean
 *                 description: Approval status of the tree removal license
 *                 example: true
 *               Tree_removal_license_note:
 *                 type: string
 *                 description: Admin note regarding tree removal license
 *                 example: "Tree removal license verified."
 *               isWorkersCompApproved:
 *                 type: boolean
 *                 description: Approval status of workers' compensation insurance
 *                 example: true
 *               Workers_comp_note:
 *                 type: string
 *                 description: Admin note regarding workers' compensation
 *                 example: "Workers comp verified."
 *               Certified_arborist:
 *                 type: boolean
 *                 description: Whether the arborist is certified
 *                 example: true
 *               Certified_arborist_note:
 *                 type: string
 *                 description: Admin note regarding arborist certification
 *                 example: "Verified arborist certification."
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected]
 *                 description: The overall application status
 *                 example: approved
 *               notes:
 *                 type: string
 *                 description: Overall admin notes or reason for rejection
 *                 example: "All tree removal documents approved!"
 *           examples:
 *             approved:
 *               summary: Approved Example
 *               value:
 *                 isDriversLicenseApproved: true
 *                 drivers_license_note: "Driver's license is valid."
 *                 isTreeRemovalLicenseApproved: true
 *                 Tree_removal_license_note: "Tree removal license verified."
 *                 isWorkersCompApproved: true
 *                 Workers_comp_note: "Workers comp verified."
 *                 Certified_arborist: true
 *                 Certified_arborist_note: "Arborist certification is valid."
 *                 status: approved
 *                 notes: "Everything looks good!"
 *             rejected:
 *               summary: Rejected Example
 *               value:
 *                 isDriversLicenseApproved: true
 *                 drivers_license_note: "Driver's license is valid."
 *                 isTreeRemovalLicenseApproved: false
 *                 Tree_removal_license_note: "Tree removal license is missing or expired."
 *                 isWorkersCompApproved: true
 *                 Workers_comp_note: "Workers comp verified."
 *                 Certified_arborist: false
 *                 Certified_arborist_note: "Missing arborist certification document."
 *                 status: rejected
 *                 notes: "Please provide a valid tree removal license and certified arborist documentation."
 *     responses:
 *       200:
 *         description: Tree service updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put(
  "/update-tree-removal-status/:id",
  validate(updateServiceStatusSchema),
  updateTreeService,
);

/**
 * @swagger
 * /api/admin/junk-removal/{id}:
 *   delete:
 *     summary: Delete Junk Removal Request
 *     description: Permanently deletes a junk removal service request and clears the linked user's back-reference so they can re-apply. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the junk removal record
 *     responses:
 *       200:
 *         description: Junk removal request deleted successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete("/junk-removal/:id", deleteJunkService);

/**
 * @swagger
 * /api/admin/tree-removal/{id}:
 *   delete:
 *     summary: Delete Tree Removal Request
 *     description: Permanently deletes a tree removal service request and clears the linked user's back-reference so they can re-apply. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tree removal record
 *     responses:
 *       200:
 *         description: Tree removal request deleted successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete("/tree-removal/:id", deleteTreeService);

/**
 * @swagger
 * /api/admin/update-company-status/{id}:
 *   put:
 *     summary: Update Company Status
 *     description: Updates the status and document approvals of a company registration request and sends an email to the user. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the company record
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isCOIApproved:
 *                 type: boolean
 *                 description: Approval status of Certificate of Insurance (COI)
 *                 example: true
 *               COI_notes:
 *                 type: string
 *                 description: Admin notes regarding COI validation
 *                 example: "COI is valid and covers required minimums."
 *               isW9Approved:
 *                 type: boolean
 *                 description: Approval status of W9 form
 *                 example: true
 *               W9_notes:
 *                 type: string
 *                 description: Admin notes regarding W9 form validation
 *                 example: "W9 form is signed and details are verified."
 *               isDocsApproved:
 *                 type: boolean
 *                 description: Approval status of onboarding documentation
 *                 example: true
 *               docs_notes:
 *                 type: string
 *                 description: Admin notes regarding general onboarding documents
 *                 example: "All onboarding documentation uploaded correctly."
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected]
 *                 description: Overall registration status of the company
 *                 example: approved
 *               notes:
 *                 type: string
 *                 description: Overall admin notes or reason for rejection
 *                 example: "Company has been approved successfully."
 *           examples:
 *             approved:
 *               summary: Approved Example
 *               value:
 *                 isCOIApproved: true
 *                 COI_notes: "COI is valid and matches business details."
 *                 isW9Approved: true
 *                 W9_notes: "W-9 verified and signed."
 *                 isDocsApproved: true
 *                 docs_notes: "All other documents look solid."
 *                 status: approved
 *                 notes: "Everything is perfect, welcome aboard!"
 *             rejected:
 *               summary: Rejected Example
 *               value:
 *                 isCOIApproved: false
 *                 COI_notes: "COI is missing matching business name. Please upload a corrected copy."
 *                 isW9Approved: true
 *                 W9_notes: "W-9 verified."
 *                 isDocsApproved: false
 *                 docs_notes: "Onboarding document signature is missing."
 *                 status: rejected
 *                 notes: "Please update the COI and sign the onboarding document to proceed."
 *     responses:
 *       200:
 *         description: Company service updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put(
  "/update-company-status/:id",
  validate(updateServiceStatusSchema),
  updateCompanyStatus,
);

/**
 * @swagger
 * /api/admin/company/{id}:
 *   delete:
 *     summary: Delete Commercial Builder (Company) Request
 *     description: Permanently deletes a commercial builder / company registration request, removes linked job sites, and clears the user's company reference so they can re-apply. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the company record
 *     responses:
 *       200:
 *         description: Commercial builder request deleted successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete("/company/:id", deleteCompanyService);

/**
 * @swagger
 * /api/admin/company/{id}/approve:
 *   put:
 *     summary: Approve Commercial Builder Application
 *     description: Approves a company registration request and notifies the user (in-app, push, email).
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isCOIApproved:
 *                 type: boolean
 *               COI_notes:
 *                 type: string
 *               isW9Approved:
 *                 type: boolean
 *               W9_notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Application approved
 */
router.put(
  "/company/:id/approve",
  validate(approveCompanySchema),
  approveCompanyService,
);

/**
 * @swagger
 * /api/admin/company/{id}/reject:
 *   put:
 *     summary: Reject Commercial Builder Application
 *     description: Rejects a company registration request with a required reason; notifies the user (in-app, push, email).
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Rejection reason shown to the applicant
 *               isCOIApproved:
 *                 type: boolean
 *               COI_notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Application rejected
 *       400:
 *         description: Missing rejection reason
 */
router.put(
  "/company/:id/reject",
  validate(rejectCompanySchema),
  rejectCompanyService,
);

/**
 * Commercial pricing plan CRUD
 * /api/admin/company/:id/pricing-plan
 */
router.get("/company/:id/pricing-plan", getCompanyPricingPlan);
router.put(
  "/company/:id/pricing-plan",
  validate(pricingPlanValidation),
  upsertCompanyPricingPlan,
);
router.post(
  "/company/:id/pricing-plan",
  validate(pricingPlanValidation),
  upsertCompanyPricingPlan,
);
router.delete("/company/:id/pricing-plan", deleteCompanyPricingPlan);

/**
 * Commercial config (payment method, invoice terms, docs, tier)
 * PUT /api/admin/company/:id/config
 */
router.put(
  "/company/:id/config",
  validate(companyConfigValidation),
  setCompanyCommercialConfig,
);

/**
 * Admin billing
 */
router.get("/company/:id/billing", adminListCompanyBilling);
router.get("/billing", adminListCompanyBilling);
router.put("/billing/:billingId/paid", adminMarkInvoicePaid);

/**
 * Commercial leads (also under /api/leads for public create)
 */
router.get("/leads", adminListLeads);
router.put("/leads/:id", adminUpdateLead);

/**
 * Growth platform admin surface
 * Canonical paths also live under /api/growth/admin/*
 */
router.get("/growth/config", adminGetGrowthConfig);
router.put(
  "/growth/config",
  validate(growthConfigSchema),
  adminUpdateGrowthConfig,
);
router.get("/growth/catalog", adminGrowthListCatalog);
router.post(
  "/growth/catalog",
  validate(catalogItemSchema),
  adminGrowthCreateCatalog,
);
router.put(
  "/growth/catalog/:id",
  validate(catalogItemUpdateSchema),
  adminGrowthUpdateCatalog,
);
router.delete("/growth/catalog/:id", adminGrowthDeleteCatalog);
router.get("/growth/applications", adminGrowthListApplications);
router.put(
  "/growth/applications/:id",
  validate(applicationDecisionSchema),
  adminGrowthDecideApplication,
);
router.get("/growth/operators", adminGrowthListOperators);
router.put(
  "/growth/operators/:id/override",
  validate(operatorOverrideSchema),
  adminGrowthOverrideOperator,
);
router.post(
  "/growth/operators/:id/penalty",
  validate(penaltySchema),
  adminGrowthApplyPenalty,
);
router.post(
  "/growth/operators/:id/penalty/remove",
  validate(removePenaltySchema),
  adminGrowthRemovePenalty,
);
router.put(
  "/dumbster/:id/branded",
  validate(brandedDumbsterSchema),
  adminSetDumbsterBranded,
);

/**
 * @swagger
 * /api/admin/admin-manual-review-requests:
 *   get:
 *     summary: List Admin Manual Review Requests
 *     description: Retrieve all custom quote manual review requests with optional filters and pagination. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, cancelled]
 *         description: Filter requests by status.
 *       - in: query
 *         name: userAcceptedStatus
 *         schema:
 *           type: string
 *           enum: [pending, accepted, cancelled]
 *         description: Filter requests by user acceptance status.
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter requests by user ID.
 *     responses:
 *       200:
 *         description: Admin manual review requests fetched successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *
 * /api/admin/admin-manual-review-requests/{id}:
 *   get:
 *     summary: Get Admin Manual Review Request by ID
 *     description: Retrieves details of a specific manual review request by ID. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The manual review request ID.
 *     responses:
 *       200:
 *         description: Admin manual review request fetched successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *   put:
 *     summary: Update Admin Manual Review Request
 *     description: Evaluates and updates a manual review request (Approve, Reject, or Modify Quote price/metadata). Triggers real-time notification to user.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The manual review request ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, accepted, cancelled]
 *                 description: Review status update.
 *               userAcceptedStatus:
 *                 type: string
 *                 enum: [pending, accepted, cancelled]
 *                 description: User status response.
 *               price:
 *                 type: number
 *                 description: Custom quote price specified by admin.
 *               metadata:
 *                 type: object
 *                 description: Additional quote parameters or pricing details.
 *               notes:
 *                 type: string
 *                 description: Admin evaluation notes.
 *               reason:
 *                 type: string
 *                 description: Reason for rejection/cancellation.
 *     responses:
 *       200:
 *         description: Admin manual review request updated successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *   delete:
 *     summary: Delete Admin Manual Review Request
 *     description: Soft deletes a manual review request by ID. Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The manual review request ID.
 *     responses:
 *       200:
 *         description: Admin manual review request deleted successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get("/admin-manual-review-requests", getAdminManualReviewRequests);
router.get(
  "/admin-manual-review-requests/:id",
  getAdminManualReviewRequestById,
);
router.put(
  "/admin-manual-review-requests/:id",
  validate(adminUpdateManualReviewRequestsSchema),
  updateAdminManualReviewRequests,
);
router.delete(
  "/admin-manual-review-requests/:id",
  deleteAdminManualReviewRequests,
);

// ============================================================
//  Junk Removal Admin Configuration
// ============================================================

/**
 * @swagger
 * /api/admin/junk-removal-config:
 *   get:
 *     summary: Get Junk Removal Admin Configuration
 *     description: Retrieves the single active JunkRemovalAdminConfiguration document containing all dynamic pricing rules (volume tiers, weight tiers, item type multipliers, access fees, hazard fees, and global rules). Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Junk removal admin configuration fetched successfully
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
 *                   example: Junk removal admin configuration fetched successfully
 *                 data:
 *                   type: object
 *                   description: The full JunkRemovalAdminConfiguration document
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get("/junk-removal-config", authenticate, admin, getJunkRemovalConfig);

/**
 * @swagger
 * /api/admin/junk-removal-config:
 *   put:
 *     summary: Create or Update Junk Removal Admin Configuration
 *     description: |
 *       Upserts the single JunkRemovalAdminConfiguration document.
 *       All pricing factors — volume tiers, weight tiers, item type multipliers,
 *       access fees, hazard fees, and global rules — are fully adjustable via this endpoint.
 *       The AI Vision & Pricing Engine reads this configuration live on every analysis request.
 *       Requires admin authentication.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 example: "Production pricing config v1"
 *               global_rules:
 *                 type: object
 *                 properties:
 *                   min_price_floor:
 *                     type: number
 *                     example: 150
 *                   max_instant_quote:
 *                     type: number
 *                     example: 2500
 *               volume_tiers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [region, min_cubic_yards, max_cubic_yards, base_price]
 *                   properties:
 *                     region:
 *                       type: string
 *                       example: global
 *                     min_cubic_yards:
 *                       type: number
 *                       example: 0
 *                     max_cubic_yards:
 *                       type: number
 *                       example: 3
 *                     base_price:
 *                       type: number
 *                       example: 150
 *                     trigger_manual_review:
 *                       type: boolean
 *                       example: false
 *               weight_tiers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [region, min_lbs, max_lbs, add_on_fee]
 *                   properties:
 *                     region:
 *                       type: string
 *                       example: global
 *                     min_lbs:
 *                       type: number
 *                       example: 0
 *                     max_lbs:
 *                       type: number
 *                       example: 500
 *                     add_on_fee:
 *                       type: number
 *                       example: 0
 *                     trigger_manual_review:
 *                       type: boolean
 *                       example: false
 *               item_type_multipliers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     region:
 *                       type: string
 *                       example: global
 *                     household:
 *                       type: number
 *                       example: 1.0
 *                     furniture:
 *                       type: number
 *                       example: 1.1
 *                     construction:
 *                       type: number
 *                       example: 1.35
 *                     electronics:
 *                       type: number
 *                       example: 1.2
 *                     mixed:
 *                       type: number
 *                       example: 1.15
 *                     unknown:
 *                       type: number
 *                       example: 1.1
 *               access_fees:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     region:
 *                       type: string
 *                       example: global
 *                     ground_floor:
 *                       type: number
 *                       example: 0
 *                     stairs_per_flight:
 *                       type: number
 *                       example: 50
 *                     elevator:
 *                       type: number
 *                       example: 75
 *                     long_carry:
 *                       type: number
 *                       example: 100
 *               hazard_fees:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     region:
 *                       type: string
 *                       example: global
 *                     hazardous_materials:
 *                       type: number
 *                       example: 300
 *                     heavy_lift_required:
 *                       type: number
 *                       example: 150
 *                     same_day_dispatch:
 *                       type: number
 *                       example: 200
 *                     requires_permits:
 *                       type: number
 *                       example: 175
 *                     trigger_manual_review:
 *                       type: boolean
 *                       example: false
 *     responses:
 *       200:
 *         description: Junk removal admin configuration updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put(
  "/junk-removal-config",
  authenticate,
  admin,
  upsertJunkRemovalConfig,
);

/**
 * @swagger
 * /api/admin/get-user-by-service:
 *   get:
 *     summary: Get Users by Service Type and Service ID
 *     description: |
 *       Retrieves a paginated list of unique users associated with a specific service.
 *       Supports service types: Dumbster, PortaPotty, JunkRemoval, TreeRemoval.
 *       Junk Removal and Tree Removal accept any `id` value. Dumpster and Porta Potty need a Mongo ObjectId.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: service_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Dumbster, PortaPotty, JunkRemoval, TreeRemoval]
 *           example: Dumbster
 *         description: Type of service (Dumbster, PortaPotty, JunkRemoval, TreeRemoval).
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 64f8a1b2c3d4e5f6a7b8c9d0
 *         description: Service catalog id. Required as a Mongo ObjectId for Dumpster/Porta Potty. Any value is accepted for Junk Removal and Tree Removal.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of user records per page.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query to filter users by name, username, email, or phone.
 *     responses:
 *       200:
 *         description: Users by service fetched successfully
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
 *                   example: Users by service fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: User document
 *                     total:
 *                       type: integer
 *                       example: 25
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 3
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasNextPage:
 *                       type: boolean
 *                       example: true
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
import salesKnowledgeAdminRoutes from "../sales_agent/admin.routes.js";

router.get("/get-user-by-service", authenticate, admin, getUserByService);

// AI Sales Agent Engine Admin Routes
router.use("/sales-agent", salesKnowledgeAdminRoutes);
router.use("/sales-agent/knowledge", salesKnowledgeAdminRoutes);

export default router;
