import express from "express";
import {
  getBinsProvidersController,
  getProviderDetailsController,
} from "./controller.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: PublicBinsProviders
 *   description: Public endpoints for browsing dumpster & bin providers within 100 miles
 */

/**
 * @swagger
 * /api/public/bins-providers:
 *   get:
 *     summary: Get public list of bin providers within radius (e.g. 100 miles)
 *     tags: [PublicBinsProviders]
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: User latitude coordinate
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         description: User longitude coordinate
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 100
 *         description: Search radius in miles (default 100 miles)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for hauler or city
 *       - in: query
 *         name: size
 *         schema:
 *           type: string
 *         description: Filter by dumpster size (e.g. 10-12, 14-16, 20, 30, 40)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [distance, rating, orders, price_asc, price_desc, newest]
 *         description: Sorting criteria
 */
router.get("/", getBinsProvidersController);

/**
 * @swagger
 * /api/public/bins-providers/{id}:
 *   get:
 *     summary: Get complete provider details including proper inventory, completed orders, and reviews
 *     tags: [PublicBinsProviders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider user ID
 */
router.get("/:id", getProviderDetailsController);

export default router;
