import { Router } from "express";
import {
  createTier,
  getAllTiers,
  updateTier,
  deleteTier,
  getMyScore,
} from "./controller.js";
import { validate } from "../../middlewares/validate.js";
import { createTierValidation, updateTierValidation } from "./validation.js";
import { authenticate, admin } from "../../middlewares/auth.js";

const router = Router();
/**
 * @swagger
 * components:
 *   schemas:
 *     PerformanceFactors:
 *       type: object
 *       properties:
 *         completedJobs:
 *           type: number
 *         acceptanceRate:
 *           type: number
 *         onTimeDelivery:
 *           type: number
 *         rating:
 *           type: number
 *         cancellationRate:
 *           type: number
 *         responseRate:
 *           type: number
 *         totalRevenue:
 *           type: number
 *     Tier:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         level:
 *           type: number
 *         benefits:
 *           type: array
 *           items:
 *             type: string
 *         minimumPerformanceFactorsValue:
 *           $ref: '#/components/schemas/PerformanceFactors'
 *         maximumPerformanceFactorsValue:
 *           $ref: '#/components/schemas/PerformanceFactors'
 *         description:
 *           type: string
 */

/**
 * @swagger
 * tags:
 *   name: Tier
 *   description: Tier management
 */

/**
 * @swagger
 * /api/tier/my-score:
 *   get:
 *     summary: Get the authenticated operator's score, tier details, and performance metrics
 *     tags: [Tier]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Operator score with tier info and performance breakdown
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
 *                     score:
 *                       type: number
 *                       example: 85
 *                     tier:
 *                       type: object
 *                       properties:
 *                         level:
 *                           type: number
 *                           example: 3
 *                         title:
 *                           type: string
 *                           example: "Elite Operator"
 *                         description:
 *                           type: string
 *                         benefits:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example:
 *                             - "Priority job notifications - 30 second head start"
 *                             - "Higher visibility in operator search results"
 *                             - "Exclusive access to high-value commercial jobs"
 *                             - "Dedicated account support line"
 *                     completionRate:
 *                       type: number
 *                       example: 92
 *                     performance:
 *                       type: object
 *                       properties:
 *                         jobsDone:
 *                           type: number
 *                           example: 124
 *                         acceptance:
 *                           type: number
 *                           example: 98
 *                         onTime:
 *                           type: number
 *                           example: 95
 *                         rating:
 *                           type: number
 *                           example: 4.9
 *                         cancellation:
 *                           type: number
 *                           example: 2
 *                         response:
 *                           type: number
 *                           description: Average response time in minutes
 *                           example: 15
 *                         revenue:
 *                           type: number
 *                           example: 4250
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/my-score", authenticate, getMyScore);

router.use(authenticate, admin);

/**
 * @swagger
 * /api/tier:
 *   post:
 *     summary: Create a new tier
 *     tags: [Tier]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - minimumPerformanceFactorsValue
 *               - maximumPerformanceFactorsValue
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *               milesCharges:
 *                 type: object
 *                 properties:
 *                   ZeroToTenMiles:
 *                     type: number
 *                   ElevenToTwentyMiles:
 *                     type: number
 *                   TwentyOneToThirtyMiles:
 *                     type: number
 *                   ThirtyOneToFortyMiles:
 *                     type: number
 *               minimumPerformanceFactorsValue:
 *                 $ref: '#/components/schemas/PerformanceFactors'
 *               maximumPerformanceFactorsValue:
 *                 $ref: '#/components/schemas/PerformanceFactors'
 *               description:
 *                 type: string
 *           examples:
 *             Tier1_Basic:
 *               value:
 *                 title: "Tier 1 - Basic Operator"
 *                 description: "Entry-level tier for new partners or low-activity operators."
 *                 minimumPerformanceFactorsValue:
 *                   completedJobs: 0
 *                   acceptanceRate: 0
 *                   onTimeDelivery: 0
 *                   rating: 0
 *                   cancellationRate: 20
 *                   responseRate: 0
 *                   totalRevenue: 0
 *                 milesCharges:
 *                   ZeroToTenMiles: 0
 *                   ElevenToTwentyMiles: 0
 *                   TwentyOneToThirtyMiles: 0
 *                   ThirtyOneToFortyMiles: 0
 *                 maximumPerformanceFactorsValue:
 *                   completedJobs: 50
 *                   acceptanceRate: 70
 *                   onTimeDelivery: 80
 *                   rating: 3.5
 *                   cancellationRate: 15
 *                   responseRate: 60
 *                   totalRevenue: 5000
 *             Tier2_Active:
 *               value:
 *                 title: "Tier 2 - Active Operator"
 *                 description: "Standard tier for consistent operators with proven reliability."
 *                 minimumPerformanceFactorsValue:
 *                   completedJobs: 51
 *                   acceptanceRate: 71
 *                   onTimeDelivery: 81
 *                   rating: 3.6
 *                   cancellationRate: 14
 *                   responseRate: 61
 *                   totalRevenue: 5001
 *                 milesCharges:
 *                   ZeroToTenMiles: 0
 *                   ElevenToTwentyMiles: 0
 *                   TwentyOneToThirtyMiles: 0
 *                   ThirtyOneToFortyMiles: 0
 *                 maximumPerformanceFactorsValue:
 *                   completedJobs: 150
 *                   acceptanceRate: 85
 *                   onTimeDelivery: 90
 *                   rating: 4.2
 *                   cancellationRate: 8
 *                   responseRate: 80
 *                   totalRevenue: 20000
 *             Tier3_Elite:
 *               value:
 *                 title: "Tier 3 - Elite Operator"
 *                 description: "High-performance tier with priority dispatch and increased visibility."
 *                 minimumPerformanceFactorsValue:
 *                   completedJobs: 151
 *                   acceptanceRate: 86
 *                   onTimeDelivery: 91
 *                   rating: 4.3
 *                   cancellationRate: 7
 *                   responseRate: 81
 *                   totalRevenue: 20001
 *                 milesCharges:
 *                   ZeroToTenMiles: 0
 *                   ElevenToTwentyMiles: 0
 *                   TwentyOneToThirtyMiles: 0
 *                   ThirtyOneToFortyMiles: 0
 *                 maximumPerformanceFactorsValue:
 *                   completedJobs: 400
 *                   acceptanceRate: 94
 *                   onTimeDelivery: 96
 *                   rating: 4.7
 *                   cancellationRate: 4
 *                   responseRate: 95
 *                   totalRevenue: 100000
 *             Tier4_Premier:
 *               value:
 *                 title: "Tier 4 - Premier / Branded"
 *                 description: "Top-tier operators with exclusive access to commercial contracts."
 *                 minimumPerformanceFactorsValue:
 *                   completedJobs: 401
 *                   acceptanceRate: 95
 *                   onTimeDelivery: 97
 *                   rating: 4.8
 *                   cancellationRate: 3
 *                   responseRate: 96
 *                   totalRevenue: 100001
 *                 milesCharges:
 *                   ZeroToTenMiles: 0
 *                   ElevenToTwentyMiles: 0
 *                   TwentyOneToThirtyMiles: 0
 *                   ThirtyOneToFortyMiles: 0
 *                 maximumPerformanceFactorsValue:
 *                   completedJobs: 1000
 *                   acceptanceRate: 98
 *                   onTimeDelivery: 99
 *                   rating: 4.9
 *                   cancellationRate: 2
 *                   responseRate: 98
 *                   totalRevenue: 500000
 *             Tier5_Legendary:
 *               value:
 *                 title: "Tier 5 - Legendary Partner"
 *                 description: "Exclusive tier for long-term partners with near-perfect performance history."
 *                 minimumPerformanceFactorsValue:
 *                   completedJobs: 1001
 *                   acceptanceRate: 99
 *                   onTimeDelivery: 100
 *                   rating: 5.0
 *                   cancellationRate: 1
 *                   responseRate: 99
 *                   totalRevenue: 500001
 *                 milesCharges:
 *                   ZeroToTenMiles: 0
 *                   ElevenToTwentyMiles: 0
 *                   TwentyOneToThirtyMiles: 0
 *                   ThirtyOneToFortyMiles: 0
 *                 maximumPerformanceFactorsValue:
 *                   completedJobs: 99999
 *                   acceptanceRate: 100
 *                   onTimeDelivery: 100
 *                   rating: 5.0
 *                   cancellationRate: 0
 *                   responseRate: 100
 *                   totalRevenue: 100000000
 *     responses:
 *       201:
 *         description: Tier created successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post("/", validate(createTierValidation), createTier);

/**
 * @swagger
 * /api/tier:
 *   get:
 *     summary: Get all tiers
 *     tags: [Tier]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all tiers
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
 *                     $ref: '#/components/schemas/Tier'
 */
router.get("/", getAllTiers);

/**
 * @swagger
 * /api/tier/{id}:
 *   put:
 *     summary: Update a tier
 *     tags: [Tier]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tier ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               minimumPerformanceFactorsValue:
 *                 $ref: '#/components/schemas/PerformanceFactors'
 *               maximumPerformanceFactorsValue:
 *                 $ref: '#/components/schemas/PerformanceFactors'
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tier updated successfully
 */
router.put("/:id", validate(updateTierValidation), updateTier);

/**
 * @swagger
 * /api/tier/{id}:
 *   delete:
 *     summary: Delete a tier
 *     tags: [Tier]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tier ID
 *     responses:
 *       200:
 *         description: Tier deleted successfully
 */
router.delete("/:id", deleteTier);

export default router;
