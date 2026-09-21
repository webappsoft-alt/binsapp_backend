import express from "express";
import {
  createDumbsterSchema,
  updateDumbsterSchema,
  updateDumbsterStatusSchema,
  updateTreeRemovalSchema,
  createPortaPottySchema,
  updatePortaPottySchema,
  updateJunkRemovalSchema,
} from "./validation.js";
import {
  createDumbsterController,
  updateDumbsterController,
  updateDumbsterStatusController,
  getAllDumbsterController,
  getDumbsterByIdController,
  deleteDumbsterController,
  getNearbyDumbsterController,
  updateTreeRemovalController,
  getAllTreeRemovalController,
  getTreeRemovalByIdController,
  // deleteTreeRemovalController,
  createPortaPottyController,
  updatePortaPottyController,
  getAllPortaPottyController,
  getPortaPottyByIdController,
  deletePortaPottyController,
  getNearbyPortaPottyController,
  updateJunkRemovalController,
  getAllJunkRemovalController,
  getJunkRemovalByIdController,
  // deleteJunkRemovalController,
} from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tree Removal Configuration
 *   description: Tree removal Configuration management (Admin only)
 */

/**
 * @swagger
 * /api/dumbster/tree-removal/{id}:
 *   put:
 *     summary: Update tree removal configuration
 *     description: Update details of an existing tree removal service configuration.
 *     tags: [Tree Removal Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tree Removal ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               global_rules:
 *                 type: object
 *                 properties:
 *                   min_price_floor:
 *                     type: number
 *                   max_instant_quote:
 *                     type: number
 *               height_tiers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     minimum_height:
 *                       type: number
 *                     maximum_height:
 *                       type: number
 *                     base_price:
 *                       type: number
 *                     trigger_manual_review:
 *                       type: boolean
 *               dbh_tiers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     minimum_diameter:
 *                       type: number
 *                     maximum_diameter:
 *                       type: number
 *                     add_on_fee:
 *                       type: number
 *                     trigger_manual_review:
 *                       type: boolean
 *               type_multipliers:
 *                 type: object
 *                 properties:
 *                   standard:
 *                     type: number
 *                   hardwood:
 *                     type: number
 *                   palm:
 *                     type: number
 *                   unknown:
 *                     type: number
 *               access_fees:
 *                 type: object
 *                 properties:
 *                   easy:
 *                     type: number
 *                   moderate:
 *                     type: number
 *                   difficult:
 *                     type: number
 *               hazard_fees:
 *                 type: object
 *                 properties:
 *                   power_lines:
 *                     type: number
 *                   near_structure:
 *                     type: number
 *                   tight_drop_zone:
 *                     type: number
 *                   emergency_same_day:
 *                     type: number
 *                   crane_likely:
 *                     type: object
 *                     properties:
 *                       trigger_manual_review:
 *                         type: boolean
 *               status:
 *                 type: string
 *                 enum: ["active", "deactive"]
 *               disposal_notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tree removal updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put(
  "/tree-removal/:id",
  [authenticate, admin],
  validate(updateTreeRemovalSchema),
  updateTreeRemovalController,
);

/**
 * @swagger
 * /api/dumbster/tree-removal:
 *   get:
 *     summary: Get  tree removal Configuration
 *     description: Retrieve a list of all tree removal service configurations with optional filtering and pagination.
 *     tags: [Tree Removal Configuration]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, deactive]
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Tree removal services fetched successfully
 *       500:
 *         description: Internal server error
 */
router.get("/tree-removal", getAllTreeRemovalController);

/**
 * @swagger
 * /api/dumbster/tree-removal/{id}:
 *   get:
 *     summary: Get tree removal by ID
 *     description: Retrieve details of a specific tree removal service configuration.
 *     tags: [Tree Removal Configuration]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tree Removal ID
 *     responses:
 *       200:
 *         description: Tree removal service fetched successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
// router.get("/tree-removal/:id", getTreeRemovalByIdController);

/**
 * @swagger
 * tags:
 *   name: Porta Potty
 *   description: Porta potty rental service management (Admin only)
 */

/**
 * @swagger
 * /api/dumbster/porta-potty:
 *   post:
 *     summary: Create a new porta potty service configuration
 *     description: Creates a new porta potty rental service configuration with unit types, duration-based rates, and service plans. Only accessible by admin users.
 *     tags: [Porta Potty]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rates, service_plan]
 *             properties:
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: "Standard portable toilet for construction sites"
 *               unit_type:
 *                 type: string
 *                 enum: ["Standard", "Deluxe with Sink", "ADA Accessible (Wheelchair)", "High-Rise (with Crane Hook)", "Luxury Trailer (Multi-stall)"]
 *                 default: "Standard"
 *                 example: "Standard"
 *               rates:
 *                 type: object
 *                 description: Duration-based rental rates (required)
 *                 properties:
 *                   per_dim_rate:
 *                     type: number
 *                     minimum: 0
 *                     default: 0
 *                     example: 10.00
 *                   day_price_km:
 *                     type: number
 *                     minimum: 0
 *                     default: 0
 *                     example: 15.00
 *                   three_days_price:
 *                     type: number
 *                     minimum: 0
 *                     default: 0
 *                     example: 150.00
 *                   three_days_saved:
 *                     type: number
 *                     minimum: 0
 *                     default: 0
 *                     example: 25.00
 *                   seven_days_price:
 *                     type: number
 *                     minimum: 0
 *                     default: 0
 *                     example: 280.00
 *                   seven_days_saved:
 *                     type: number
 *                     minimum: 0
 *                     default: 0
 *                     example: 50.00
 *                   min_rental_period_days:
 *                     type: number
 *                     minimum: 1
 *                     default: 1
 *                     example: 1
 *               service_plan:
 *                 type: object
 *                 description: Cleaning and maintenance plan (required)
 *                 properties:
 *                   cleaning_frequency_label:
 *                     type: string
 *                     enum: ["Once Weekly", "Twice Weekly", "Daily", "On-Call"]
 *                     default: "Once Weekly"
 *                     example: "Once Weekly"
 *                   extra_cleaning_fee:
 *                     type: number
 *                     minimum: 0
 *                     default: 0
 *                     example: 25.00
 *                   hand_sanitizer_refill_included:
 *                     type: boolean
 *                     default: true
 *                     example: true
 *                   paper_towel_refill_included:
 *                     type: boolean
 *                     default: true
 *                     example: true
 *               specs:
 *                 type: object
 *                 properties:
 *                   user_capacity_estimate:
 *                     type: number
 *                     minimum: 0
 *                     nullable: true
 *                     example: 50
 *                   tank_volume_gallons:
 *                     type: number
 *                     minimum: 0
 *                     nullable: true
 *                     example: 60
 *                   dimension:
 *                     type: string
 *                     nullable: true
 *                     example: "4ft x 4ft x 7ft"
 *                   weight_lbs:
 *                     type: number
 *                     minimum: 0
 *                     nullable: true
 *                     example: 200
 *               base_price:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *                 example: 75.00
 *               delivery_setup_fee:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *                 example: 50.00
 *               pickup_fee:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *                 example: 50.00
 *               travel_fee_per_km:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *                 example: 1.50
 *               emergency_service_fee:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *                 example: 100.00
 *               is_addon_only:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *               placement_requirements:
 *                 type: string
 *                 nullable: true
 *                 example: "Flat, accessible surface required"
 *               usage:
 *                 type: string
 *                 enum: ["Construction", "Event", "Agricultural", "Residential"]
 *                 nullable: true
 *                 example: "Construction"
 *               status:
 *                 type: string
 *                 enum: ["active", "deactive"]
 *                 default: "active"
 *                 example: "active"
 *           examples:
 *             standardConstruction:
 *               summary: Standard Unit — Construction Site
 *               description: Basic unit for a small-to-mid construction crew; weekly cleaning included.
 *               value:
 *                 description: "Standard portable toilet for active construction sites with 15–25 workers per shift"
 *                 unit_type: "Standard"
 *                 rates:
 *                   per_dim_rate: 10.00
 *                   day_price_km: 15.00
 *                   three_days_price: 165.00
 *                   three_days_saved: 20.00
 *                   seven_days_price: 295.00
 *                   seven_days_saved: 55.00
 *                   min_rental_period_days: 3
 *                 service_plan:
 *                   cleaning_frequency_label: "Once Weekly"
 *                   extra_cleaning_fee: 35.00
 *                   hand_sanitizer_refill_included: true
 *                   paper_towel_refill_included: false
 *                 specs:
 *                   user_capacity_estimate: 25
 *                   tank_volume_gallons: 60
 *                   dimension: "4ft x 4ft x 7.5ft"
 *                   weight_lbs: 185
 *                 base_price: 89.00
 *                 delivery_setup_fee: 75.00
 *                 pickup_fee: 65.00
 *                 travel_fee_per_km: 2.25
 *                 emergency_service_fee: 125.00
 *                 is_addon_only: false
 *                 placement_requirements: "Must be placed on flat, level ground within 15ft of service vehicle access"
 *                 usage: "Construction"
 *                 status: "active"
 *             deluxeEvent:
 *               summary: Deluxe with Sink — Outdoor Event
 *               description: Upgraded unit with hand-washing for weddings, festivals, or corporate events.
 *               value:
 *                 description: "Deluxe unit with built-in sink for outdoor events requiring higher guest comfort"
 *                 unit_type: "Deluxe with Sink"
 *                 rates:
 *                   per_dim_rate: 10.00
 *                   day_price_km: 20.00
 *                   three_days_price: 285.00
 *                   three_days_saved: 35.00
 *                   seven_days_price: 520.00
 *                   seven_days_saved: 90.00
 *                   min_rental_period_days: 1
 *                 service_plan:
 *                   cleaning_frequency_label: "Twice Weekly"
 *                   extra_cleaning_fee: 45.00
 *                   hand_sanitizer_refill_included: true
 *                   paper_towel_refill_included: true
 *                 specs:
 *                   user_capacity_estimate: 75
 *                   tank_volume_gallons: 65
 *                   dimension: "4.5ft x 4.5ft x 8ft"
 *                   weight_lbs: 220
 *                 base_price: 145.00
 *                 delivery_setup_fee: 95.00
 *                 pickup_fee: 85.00
 *                 travel_fee_per_km: 2.75
 *                 emergency_service_fee: 175.00
 *                 is_addon_only: false
 *                 placement_requirements: "Requires level ground and access for pump truck; place near water line if available"
 *                 usage: "Event"
 *                 status: "active"
 *             adaResidential:
 *               summary: ADA Accessible — Residential Renovation
 *               description: Wheelchair-accessible unit for home renovation or HOA-compliant placement.
 *               value:
 *                 description: "ADA-compliant portable restroom for residential renovation projects with wheelchair access ramp"
 *                 unit_type: "ADA Accessible (Wheelchair)"
 *                 rates:
 *                   per_dim_rate: 12.00
 *                   day_price_km: 18.00
 *                   three_days_price: 225.00
 *                   three_days_saved: 30.00
 *                   seven_days_price: 410.00
 *                   seven_days_saved: 70.00
 *                   min_rental_period_days: 3
 *                 service_plan:
 *                   cleaning_frequency_label: "Once Weekly"
 *                   extra_cleaning_fee: 40.00
 *                   hand_sanitizer_refill_included: true
 *                   paper_towel_refill_included: true
 *                 specs:
 *                   user_capacity_estimate: 30
 *                   tank_volume_gallons: 68
 *                   dimension: "5ft x 5ft x 7.5ft"
 *                   weight_lbs: 265
 *                 base_price: 120.00
 *                 delivery_setup_fee: 85.00
 *                 pickup_fee: 75.00
 *                 travel_fee_per_km: 2.50
 *                 emergency_service_fee: 150.00
 *                 is_addon_only: false
 *                 placement_requirements: "Minimum 5ft clearance on ramp side; must comply with ADA slope and landing requirements"
 *                 usage: "Residential"
 *                 status: "active"
 *             highRiseConstruction:
 *               summary: High-Rise — Crane-Hook Construction
 *               description: Crane-lift unit for multi-story building projects with on-call servicing.
 *               value:
 *                 description: "High-rise portable toilet with crane hook for upper-floor construction access"
 *                 unit_type: "High-Rise (with Crane Hook)"
 *                 rates:
 *                   per_dim_rate: 15.00
 *                   day_price_km: 25.00
 *                   three_days_price: 340.00
 *                   three_days_saved: 40.00
 *                   seven_days_price: 620.00
 *                   seven_days_saved: 110.00
 *                   min_rental_period_days: 7
 *                 service_plan:
 *                   cleaning_frequency_label: "On-Call"
 *                   extra_cleaning_fee: 65.00
 *                   hand_sanitizer_refill_included: true
 *                   paper_towel_refill_included: false
 *                 specs:
 *                   user_capacity_estimate: 20
 *                   tank_volume_gallons: 55
 *                   dimension: "3.5ft x 4ft x 7ft"
 *                   weight_lbs: 310
 *                 base_price: 195.00
 *                 delivery_setup_fee: 250.00
 *                 pickup_fee: 200.00
 *                 travel_fee_per_km: 3.50
 *                 emergency_service_fee: 225.00
 *                 is_addon_only: false
 *                 placement_requirements: "Crane lift required; certified rigging point only; coordinate lift schedule with site superintendent"
 *                 usage: "Construction"
 *                 status: "active"
 *             luxuryTrailerFestival:
 *               summary: Luxury Trailer — Large Festival
 *               description: Multi-stall luxury trailer for high-traffic festivals or VIP areas.
 *               value:
 *                 description: "Multi-stall luxury restroom trailer for large outdoor festivals and VIP hospitality zones"
 *                 unit_type: "Luxury Trailer (Multi-stall)"
 *                 rates:
 *                   day_price_km: 50.00
 *                   per_dim_rate: 10.00
 *                   three_days_price: 1850.00
 *                   three_days_saved: 200.00
 *                   seven_days_price: 3400.00
 *                   seven_days_saved: 450.00
 *                   min_rental_period_days: 3
 *                 service_plan:
 *                   cleaning_frequency_label: "Daily"
 *                   extra_cleaning_fee: 120.00
 *                   hand_sanitizer_refill_included: true
 *                   paper_towel_refill_included: true
 *                 specs:
 *                   user_capacity_estimate: 400
 *                   tank_volume_gallons: 250
 *                   dimension: "24ft x 8ft x 11ft"
 *                   weight_lbs: 5200
 *                 base_price: 950.00
 *                 delivery_setup_fee: 450.00
 *                 pickup_fee: 400.00
 *                 travel_fee_per_km: 5.00
 *                 emergency_service_fee: 350.00
 *                 is_addon_only: false
 *                 placement_requirements: "Requires dedicated 30A power hookup, water connection, and firm level pad; minimum 12ft overhead clearance"
 *                 usage: "Event"
 *                 status: "active"
 *     responses:
 *       201:
 *         description: Porta potty service created successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */
router.post(
  "/porta-potty",
  [authenticate, admin],
  validate(createPortaPottySchema),
  createPortaPottyController,
);

/**
 * @swagger
 * /api/dumbster/porta-potty/{id}:
 *   put:
 *     summary: Update porta potty configuration
 *     description: Update details of an existing porta potty rental service configuration.
 *     tags: [Porta Potty]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Porta Potty ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               unit_type:
 *                 type: string
 *                 enum: ["Standard", "Deluxe with Sink", "ADA Accessible (Wheelchair)", "High-Rise (with Crane Hook)", "Luxury Trailer (Multi-stall)"]
 *               rates:
 *                 type: object
 *               service_plan:
 *                 type: object
 *               specs:
 *                 type: object
 *               delivery_setup_fee:
 *                 type: number
 *               pickup_fee:
 *                 type: number
 *               travel_fee_per_km:
 *                 type: number
 *               emergency_service_fee:
 *                 type: number
 *               is_addon_only:
 *                 type: boolean
 *               placement_requirements:
 *                 type: string
 *               usage:
 *                 type: string
 *                 enum: ["Construction", "Event", "Agricultural", "Residential"]
 *               status:
 *                 type: string
 *                 enum: ["active", "deactive"]
 *     responses:
 *       200:
 *         description: Porta potty updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put(
  "/porta-potty/:id",
  [authenticate, admin],
  validate(updatePortaPottySchema),
  updatePortaPottyController,
);

/**
 * @swagger
 * /api/dumbster/porta-potty/nearby:
 *   get:
 *     summary: Get available porta potty services near a location
 *     description: Returns porta potty service configurations with availability information within a 20km radius of the provided coordinates.
 *     tags: [Porta Potty]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         description: Latitude of the location
 *         example: 28.5383
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *         description: Longitude of the location
 *         example: -81.3792
 *     responses:
 *       200:
 *         description: Successfully fetched nearby services
 *       400:
 *         description: Bad request (missing or invalid coordinates)
 *       500:
 *         description: Internal server error
 */
router.get("/porta-potty/nearby", getNearbyPortaPottyController);

/**
 * @swagger
 * /api/dumbster/porta-potty:
 *   get:
 *     summary: Get all porta potty services
 *     description: Retrieve a list of all porta potty service configurations with optional filtering and pagination.
 *     tags: [Porta Potty]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, deactive]
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Porta potty services fetched successfully
 *       500:
 *         description: Internal server error
 */
router.get("/porta-potty", getAllPortaPottyController);

/**
 * @swagger
 * /api/dumbster/porta-potty/{id}:
 *   get:
 *     summary: Get porta potty by ID
 *     description: Retrieve details of a specific porta potty service configuration.
 *     tags: [Porta Potty]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Porta Potty ID
 *     responses:
 *       200:
 *         description: Porta potty service fetched successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.get("/porta-potty/:id", getPortaPottyByIdController);

/**
 * @swagger
 * /api/dumbster/porta-potty/{id}:
 *   delete:
 *     summary: Delete porta potty service
 *     description: Delete a specific porta potty service configuration.
 *     tags: [Porta Potty]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Porta Potty ID
 *     responses:
 *       200:
 *         description: Porta potty service deleted successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.delete(
  "/porta-potty/:id",
  [authenticate, admin],
  deletePortaPottyController,
);

/**
 * @swagger
 * tags:
 *   name: Junk Removal Configuration
 *   description: Junk removal configuration management (Admin only)
 */

/**
 * @swagger
 * /api/dumbster/junk-removal/{id}:
 *   put:
 *     summary: Update junk removal configuration
 *     description: Update details of an existing junk removal service configuration.
 *     tags: [Junk Removal Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Junk Removal ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               global_rules:
 *                 type: object
 *                 properties:
 *                   min_price_floor:
 *                     type: number
 *                   max_instant_quote:
 *                     type: number
 *               load_sizes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     label:
 *                       type: string
 *                     description:
 *                       type: string
 *                     base_price:
 *                       type: number
 *               material_types:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     multiplier:
 *                       type: number
 *                     flat_surcharge:
 *                       type: number
 *               access_fees:
 *                 type: object
 *                 properties:
 *                   stairs_per_flight:
 *                     type: number
 *                   long_distance_from_truck:
 *                     type: number
 *                   heavy_item_surcharge:
 *                     type: number
 *               service_metadata:
 *                 type: object
 *                 properties:
 *                   photos_required_min:
 *                     type: number
 *                   is_manual_review_only:
 *                     type: boolean
 *               status:
 *                 type: string
 *                 enum: ["active", "deactive"]
 *     responses:
 *       200:
 *         description: Junk removal updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put(
  "/junk-removal/:id",
  [authenticate, admin],
  validate(updateJunkRemovalSchema),
  updateJunkRemovalController,
);

/**
 * @swagger
 * /api/dumbster/junk-removal:
 *   get:
 *     summary: Get  junk removal Configuration
 *     description: Retrieve a list of all junk removal service configurations with optional filtering and pagination.
 *     tags: [Junk Removal Configuration]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, deactive]
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Junk removal services fetched successfully
 *       500:
 *         description: Internal server error
 */
router.get("/junk-removal", getAllJunkRemovalController);

/**
 * @swagger
 * /api/dumbster/junk-removal/{id}:
 *   get:
 *     summary: Get junk removal by ID
 *     description: Retrieve details of a specific junk removal service configuration.
 *     tags: [Junk Removal Configuration]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Junk Removal ID
 *     responses:
 *       200:
 *         description: Junk removal service fetched successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
// router.get("/junk-removal/:id", getJunkRemovalByIdController);

// router.use();

/**
 * @swagger
 * tags:
 *   name: Dumpster
 *   description: Dumpster size and pricing management (Admin only)
 */

/**
 * @swagger
 * /api/dumbster/:
 *   post:
 *     summary: Create a new dumpster size configuration
 *     description: Creates a new dumpster size configuration with pricing and specifications. Only accessible by admin or superadmin users. Each size must be unique.
 *     tags: [Dumpster]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - size
 *             properties:
 *               size:
 *                 type: string
 *                 description: Dumpster size (must be unique)
 *                 enum: ["6-8", "10-12", "14-16", "18-20", "30", "40"]
 *                 example: "10-12"
 *               description:
 *                 type: string
 *                 description: Description of the dumpster size and its uses
 *                 example: "Medium-sized dumpster suitable for residential projects"
 *               price:
 *                 type: number
 *                 description: Base price for the dumpster
 *                 example: 250.00
 *               delivery_price_km:
 *                 type: number
 *                 description: Delivery price per kilometer
 *                 example: 2.50
 *               dimension:
 *                 type: string
 *                 description: Physical dimensions of the dumpster
 *                 example: "12ft x 8ft x 4ft"
 *               usage:
 *                 type: string
 *                 description: Recommended usage or capacity information
 *                 example: "Suitable for 2-3 rooms of renovation debris"
 *               weight:
 *                 type: string
 *                 description: Weight capacity or limit
 *                 example: "2 tons"
 *               day_price_km:
 *                 type: number
 *                 description: Daily rental price per kilometer
 *                 example: 1.50
 *               per_dim_rate:
 *                 type: number
 *                 description: Rate per dimension unit
 *                 example: 10.5
 *               seven_days_saved:
 *                 type: number
 *                 description: Amount saved for 7-day rental
 *                 example: 50.00
 *               seven_days_price:
 *                 type: number
 *                 description: Price for 7-day rental
 *                 example: 1500.00
 *               three_days_saved:
 *                 type: number
 *                 description: Amount saved for 3-day rental
 *                 example: 25.00
 *               three_days_price:
 *                 type: number
 *                 description: Price for 3-day rental
 *                 example: 750.00
 *               tons:
 *                 type: number
 *                 description: Weight capacity in tons
 *                 example: 2
 *               company_delivery_price_km:
 *                 type: number
 *                 description: Company delivery price per kilometer
 *                 example: 2.50
 *               company_day_price_km:
 *                 type: number
 *                 description: Company daily rental price per kilometer
 *                 example: 1.50
 *               company_three_days_price:
 *                 type: number
 *                 description: Company price for 3-day rental
 *                 example: 750.00
 *               company_three_days_saved:
 *                 type: number
 *                 description: Company amount saved for 3-day rental
 *                 example: 25.00
 *               company_seven_days_price:
 *                 type: number
 *                 description: Company price for 7-day rental
 *                 example: 1500.00
 *               company_seven_days_saved:
 *                 type: number
 *                 description: Company amount saved for 7-day rental
 *                 example: 50.00
 *               company_per_dim_rate:
 *                 type: number
 *                 description: Company rate per dimension unit
 *                 example: 10.5
 *               company_price:
 *                 type: number
 *                 description: Company price for the dumpster
 *                 example: 250.00
 *     responses:
 *       201:
 *         description: Dumpster configuration created successfully
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
 *                   example: Dumpster created successfully
 *                 data:
 *                   type: object
 *                   description: Created dumpster configuration object
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Admin access required
 *       409:
 *         description: Conflict - Dumpster size already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Dumpster already exists
 *       500:
 *         description: Internal server error
 */
router.post(
  "/",
  [authenticate, admin],
  validate(createDumbsterSchema),
  createDumbsterController,
);

/**
 * @swagger
 * /api/dumbster/{id}:
 *   put:
 *     summary: Update dumpster configuration
 *     description: Update details of an existing dumpster configuration.
 *     tags: [Dumpster]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dumpster ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               size:
 *                 type: string
 *                 enum: ["6-8", "10-12", "14-16", "18-20", "30", "40"]
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               delivery_price_km:
 *                 type: number
 *               dimension:
 *                 type: string
 *               usage:
 *                 type: string
 *               weight:
 *                 type: string
 *               day_price_km:
 *                 type: number
 *               per_dim_rate:
 *                 type: number
 *               seven_days_saved:
 *                 type: number
 *               seven_days_price:
 *                 type: number
 *               three_days_saved:
 *                 type: number
 *               three_days_price:
 *                 type: number
 *               tons:
 *                 type: number
 *               company_delivery_price_km:
 *                 type: number
 *               company_day_price_km:
 *                 type: number
 *               company_three_days_price:
 *                 type: number
 *               company_three_days_saved:
 *                 type: number
 *               company_seven_days_price:
 *                 type: number
 *               company_seven_days_saved:
 *                 type: number
 *               company_per_dim_rate:
 *                 type: number
 *               company_price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Dumpster updated successfully
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
 *                     example: Dumpster updated successfully
 *                   data:
 *                     type: object
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put(
  "/:id",
  [authenticate, admin],
  validate(updateDumbsterSchema),
  updateDumbsterController,
);

/**
 * @swagger
 * /api/dumbster/{id}/status:
 *   put:
 *     summary: Update dumpster status
 *     description: Activate or deactivate a dumpster configuration.
 *     tags: [Dumpster]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dumpster ID
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
 *                 enum: ["active", "inactive"]
 *     responses:
 *       200:
 *         description: Dumpster status updated successfully
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
 *                     example: Dumpster status updated successfully
 *                   data:
 *                     type: object
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put(
  "/:id/status",
  [authenticate, admin],
  validate(updateDumbsterStatusSchema),
  updateDumbsterStatusController,
);

/**
 * @swagger
 * /api/dumbster/:
 *   get:
 *     summary: Get all dumpsters
 *     description: Retrieve a list of all dumpster configurations with optional filtering and pagination.
 *     tags: [Dumpster]
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
 *           enum: [active, inactive]
 *         description: Filter by status
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
 *     responses:
 *       200:
 *         description: Dumpsters fetched successfully
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
 *                     example: Dumpster fetched successfully
 *                   data:
 *                     type: object
 *                     properties:
 *                       docs:
 *                         type: array
 *                         items:
 *                           type: object
 *                       totalDocs:
 *                         type: integer
 *                       limit:
 *                         type: integer
 *                       totalPages:
 *                         type: integer
 *                       page:
 *                         type: integer
 *                       pagingCounter:
 *                         type: integer
 *                       hasPrevPage:
 *                         type: boolean
 *                       hasNextPage:
 *                         type: boolean
 *                       prevPage:
 *                         type: integer
 *                       nextPage:
 *                         type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/", getAllDumbsterController);

/**
 * @swagger
 * /api/dumbster/nearby:
 *   get:
 *     summary: Get available dumpsters near a location
 *     description: Returns all dumpster configurations with the count of available physical bins within a 20km radius of the provided coordinates.
 *     tags: [Dumpster]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         description: Latitude of the location
 *         example: 28.5383
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *         description: Longitude of the location
 *         example: -81.3792
 *     responses:
 *       200:
 *         description: Successfully fetched nearby dumpsters
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
 *                   example: "Dumbster fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "60d5ecb8b39169a5a8f8e02b"
 *                       size:
 *                         type: string
 *                         example: "10-12"
 *                       availableBins:
 *                         type: integer
 *                         description: Number of available physical bins for this size within radius
 *                         example: 5
 *       400:
 *         description: Bad request (missing or invalid coordinates)
 */
router.get("/nearby", getNearbyDumbsterController);

/**
 * @swagger
 * /api/dumbster/{id}:
 *   get:
 *     summary: Get dumpster by ID
 *     description: Retrieve details of a specific dumpster configuration.
 *     tags: [Dumpster]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dumpster ID
 *     responses:
 *       200:
 *         description: Dumpster fetched successfully
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
 *                     example: Dumpster fetched successfully
 *                   data:
 *                     type: object
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.get("/:id", getDumbsterByIdController);

/**
 * @swagger
 * /api/dumbster/{id}:
 *   delete:
 *     summary: Delete dumpster
 *     description: Delete a specific dumpster configuration.
 *     tags: [Dumpster]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dumpster ID
 *     responses:
 *       200:
 *         description: Dumpster deleted successfully
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
 *                     example: Dumpster deleted successfully
 *                   data:
 *                     type: object
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", [authenticate, admin], deleteDumbsterController);

export default router;
