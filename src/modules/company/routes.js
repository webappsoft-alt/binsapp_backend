import express from "express";
import {
  adminUpdateCompanyStatusValidation,
  createCompanyValidation,
  createJobSiteValidation,
  updateCompanyValidation,
  quoteValidation,
  swapRequestValidation,
} from "./validation.js";
import {
  adminUpdateCompanyStatus,
  createCompany,
  createJobSite,
  getAllCompanies,
  getCompanyByIdAdmin,
  getUserCompany,
  updateCompany,
  getJobSites,
  updateJobSite,
  deleteJobSite,
  quoteCommercial,
  getCompanyBilling,
  createSwapRequest,
  updateSwapRequest,
} from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
const router = express.Router();
/**
 * @swagger
 * tags:
 *   name: Company
 *   description: Company management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateCompany:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - phone
 *         - EIN
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the company
 *         email:
 *           type: string
 *           format: email
 *           description: Email address of the company
 *         phone:
 *           type: string
 *           description: Phone number of the company
 *         EIN:
 *           type: string
 *           description: Employer Identification Number
 *         taxInfo:
 *           type: string
 *           description: Tax information
 *         address:
 *           type: string
 *           description: Company address
 *         city:
 *           type: string
 *           description: City
 *         state:
 *           type: string
 *           description: State
 *         zip:
 *           type: string
 *           description: Zip code
 *         country:
 *           type: string
 *           description: Country
 *         COI:
 *           type: string
 *           description: Certificate of Insurance URL
 *         W9:
 *           type: string
 *           description: W9 form URL
 *         onBoardingDocs:
 *           type: string
 *           description: Onboarding documents URL
 *         logo:
 *           type: string
 *           description: Company logo URL
 *         primaryContact:
 *           type: object
 *           required:
 *             - name
 *             - title
 *           properties:
 *             name:
 *               type: string
 *             email:
 *               type: string
 *               format: email
 *             phone:
 *               type: string
 *             title:
 *               type: string
 *         accountsPayableEmail:
 *           type: string
 *           format: email
 *         expectedMonthlyVolume:
 *           type: number
 *         PO:
 *           type: boolean
 *         taxExempt:
 *           type: string
 *         authorizedSigner:
 *           type: object
 *           required:
 *             - name
 *             - title
 *           properties:
 *             name:
 *               type: string
 *             email:
 *               type: string
 *               format: email
 *             phone:
 *               type: string
 *             title:
 *               type: string
 *     CompanyResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         message:
 *           type: string
 *           example: Company created successfully
 *         data:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             name:
 *               type: string
 *             email:
 *               type: string
 *             phone:
 *               type: string
 *             EIN:
 *               type: string
 *             status:
 *               type: string
 *               enum: [pending, approved, rejected]
 *             primaryContact:
 *               type: object
 *               properties:
 *                 name: { type: string }
 *                 email: { type: string }
 *                 phone: { type: string }
 *                 title: { type: string }
 *             accountsPayableEmail:
 *               type: string
 *             expectedMonthlyVolume:
 *               type: number
 *             PO:
 *               type: boolean
 *             taxExempt:
 *               type: string
 *             authorizedSigner:
 *               type: object
 *               properties:
 *                 name: { type: string }
 *                 email: { type: string }
 *                 phone: { type: string }
 *                 title: { type: string }
 *             user:
 *               type: string
 *             createdAt:
 *               type: string
 *               format: date-time
 *     UpdateJobSite:
 *       type: object
 *       properties:
 *         siteName:
 *           type: string
 *           example: "Updated Site Name"
 *         address:
 *           type: string
 *           example: "789 New Way, Austin, TX"
 *         location:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               enum: [Point]
 *               example: "Point"
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *               example: [-97.7431, 30.2672]
 *         city:
 *           type: string
 *           example: "Austin"
 *         state:
 *           type: string
 *           example: "TX"
 *         notes:
 *           type: string
 *         instructions:
 *           type: string
 *         images:
 *           type: array
 *           items:
 *             type: string
 *         num_days:
 *           type: number
 *         quantity:
 *           type: number
 *         time:
 *           type: string
 *           format: date-time
 *         materialInformation:
 *           type: string
 *         category:
 *           type: string
 *         subCategory:
 *           type: string
 *         dropoff_image:
 *           type: string
 *         dumbsterId:
 *           type: string
 *     CreateJobSite:
 *       type: object
 *       required:
 *         - siteName
 *         - address
 *         - location
 *       properties:
 *         siteName:
 *           type: string
 *           example: "New Construction Site"
 *         address:
 *           type: string
 *           example: "456 Builders Way, Austin, TX"
 *         location:
 *           type: object
 *           required:
 *             - type
 *             - coordinates
 *           properties:
 *             type:
 *               type: string
 *               enum: [Point]
 *               example: "Point"
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *               example: [-97.7431, 30.2672]
 *         city:
 *           type: string
 *           example: "Austin"
 *         state:
 *           type: string
 *           example: "TX"
 *         notes:
 *           type: string
 *           example: "Near the north entrance"
 *         instructions:
 *           type: string
 *           example: "Call foreman on arrival"
 *         images:
 *           type: array
 *           items:
 *             type: string
 *           example: ["https://example.com/site1.jpg"]
 *         num_days:
 *           type: number
 *           example: 5
 *         quantity:
 *           type: number
 *           example: 1
 *         time:
 *           type: string
 *           format: date-time
 *           example: "2024-05-07T10:00:00Z"
 *         materialInformation:
 *           type: string
 *           example: "Mixed heavy debris"
 *         category:
 *           type: string
 *           example: "Residential"
 *         subCategory:
 *           type: string
 *           example: "Renovation"
 *         dropoff_image:
 *           type: string
 *           example: "https://example.com/dropoff.jpg"
 *         dumbsterId:
 *           type: string
 *           example: "670f3b1b79d84f7f0a2d4e1a"
 *     JobSiteResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         message:
 *           type: string
 *           example: Job site created successfully
 *         data:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             siteName:
 *               type: string
 *             address:
 *               type: string
 *             location:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                 coordinates:
 *                   type: array
 *                   items:
 *                     type: number
 *             city:
 *               type: string
 *             state:
 *               type: string
 *             notes:
 *               type: string
 *             instructions:
 *               type: string
 *             images:
 *               type: array
 *               items:
 *                 type: string
 *             num_days:
 *               type: number
 *             quantity:
 *               type: number
 *             time:
 *               type: string
 *               format: date-time
 *             materialInformation:
 *               type: string
 *             category:
 *               type: string
 *             subCategory:
 *               type: string
 *             dropoff_image:
 *               type: string
 *             dumbsterId:
 *               type: string
 *             company:
 *               type: string
 *             createdAt:
 *               type: string
 *               format: date-time
 */
router.use(authenticate);
/**
 * @swagger
 * /api/company/:
 *   post:
 *     summary: Create a new company
 *     description: Creates a new company.
 *     tags: [Company]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CreateCompany"
 *           examples:
 *             RequiredOnly:
 *               summary: Example with only required fields
 *               value:
 *                 name: "Acme Corp"
 *                 email: "contact@acme.com"
 *                 phone: "+1234567890"
 *                 EIN: "12-3456789"
 *             WithPrimaryContact:
 *               summary: Example with primary contact info
 *               value:
 *                 name: "Global Bins"
 *                 email: "info@globalbins.com"
 *                 phone: "+9876543210"
 *                 EIN: "98-7654321"
 *                 primaryContact:
 *                   name: "Alice Johnson"
 *                   title: "Manager"
 *                   email: "alice@globalbins.com"
 *             MasterExample:
 *               summary: Master example with all possible fields
 *               value:
 *                 name: "Full Service Company"
 *                 email: "admin@fullservice.com"
 *                 phone: "+1122334455"
 *                 EIN: "11-2233445"
 *                 taxInfo: "TAX-123456"
 *                 address: "123 Main St"
 *                 city: "New York"
 *                 state: "NY"
 *                 zip: "10001"
 *                 country: "USA"
 *                 COI: "https://example.com/coi.pdf"
 *                 W9: "https://example.com/w9.pdf"
 *                 onBoardingDocs: "https://example.com/docs.pdf"
 *                 logo: "https://example.com/logo.png"
 *                 primaryContact:
 *                   name: "John Doe"
 *                   email: "john@fullservice.com"
 *                   phone: "+1122334455"
 *                   title: "CEO"
 *                 accountsPayableEmail: "ap@fullservice.com"
 *                 expectedMonthlyVolume: 5000
 *                 PO: true
 *                 taxExempt: "EXEMPT-999"
 *                 authorizedSigner:
 *                   name: "Jane Smith"
 *                   email: "jane@fullservice.com"
 *                   phone: "+1122334466"
 *                   title: "CFO"
 *     responses:
 *       201:
 *         description: Company created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CompanyResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequestError"
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
router.post("/", validate(createCompanyValidation), createCompany);
/**
 * @swagger
 * /api/company/:
 *   get:
 *     summary: Get user company
 *     description: Retrieves the authenticated user's company.
 *     tags: [Company]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved company
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CompanyResponse"
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       404:
 *         $ref: "#/components/responses/NotFoundError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
router.get("/", getUserCompany);

/**
 * @swagger
 * /api/company/jobsite:
 *   post:
 *     summary: Create a new job site
 *     description: Creates a new job site for a specific company.
 *     tags: [Company]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *           example: 670f3b1b79d84f7f0a2d4e1a
 *         description: The ID of the company
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CreateJobSite"
 *           examples:
 *             RequiredOnly:
 *               summary: Minimal required fields
 *               value:
 *                 siteName: "Downtown Project"
 *                 address: "100 Main St, Austin, TX"
 *                 location:
 *                   type: "Point"
 *                   coordinates: [-97.7431, 30.2672]
 *             FullDetails:
 *               summary: Example with all fields
 *               value:
 *                 siteName: "Westside Luxury Apartments"
 *                 address: "789 West Ave, Austin, TX"
 *                 location:
 *                   type: "Point"
 *                   coordinates: [-97.7511, 30.2711]
 *                 city: "Austin"
 *                 state: "TX"
 *                 notes: "Gate code is 1234"
 *                 instructions: "Deliver dumpsters to the south-west corner"
 *                 images: ["https://example.com/site-map.jpg", "https://example.com/entrance.jpg"]
 *                 num_days: 7
 *                 quantity: 2
 *                 time: "2024-05-10T08:00:00Z"
 *                 materialInformation: "Concrete and rebar"
 *                 category: "Commercial"
 *                 subCategory: "New Construction"
 *                 dropoff_image: "https://example.com/dropoff-spot.jpg"
 *                 dumbsterId: "670f3b1b79d84f7f0a2d4e1a"
 *     responses:
 *       201:
 *         description: Job site created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/JobSiteResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequestError"
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       404:
 *         $ref: "#/components/responses/NotFoundError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */

router.post("/jobsite", validate(createJobSiteValidation), createJobSite);

/**
 * @swagger
 * /api/company/jobsites:
 *   get:
 *     summary: Get company job sites
 *     description: Retrieves a paginated list of job sites for the authenticated user's company.
 *     tags: [Company]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: "Downtown"
 *         description: Search by site name
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *           example: "Austin"
 *         description: Filter by city
 *     responses:
 *       200:
 *         description: Successfully retrieved job sites
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Job sites fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: "#/components/schemas/JobSiteResponse"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
router.get("/jobsites", getJobSites);

/**
 * @swagger
 * /api/company/jobsites/{id}:
 *   put:
 *     summary: Update a job site
 *     description: Updates an existing job site.
 *     tags: [Company]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 670f3b1b79d84f7f0a2d4e1a
 *         description: The ID of the job site
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/UpdateJobSite"
 *           examples:
 *             UpdateName:
 *               summary: Update site name only
 *               value:
 *                 siteName: "Phase 2 - Downtown Project"
 *             UpdateLocation:
 *               summary: Update address and location
 *               value:
 *                 address: "101 Main St, Austin, TX"
 *                 location:
 *                   type: "Point"
 *                   coordinates: [-97.7432, 30.2673]
 *     responses:
 *       200:
 *         description: Job site updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/JobSiteResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequestError"
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       404:
 *         $ref: "#/components/responses/NotFoundError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
router.put("/jobsites/:id", updateJobSite);

/**
 * @swagger
 * /api/company/jobsites/{id}:
 *   delete:
 *     summary: Delete a job site
 *     description: Deletes an existing job site.
 *     tags: [Company]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 670f3b1b79d84f7f0a2d4e1a
 *         description: The ID of the job site
 *     responses:
 *       200:
 *         description: Job site deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Job site deleted successfully
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       404:
 *         $ref: "#/components/responses/NotFoundError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
router.delete("/jobsites/:id", deleteJobSite);

/**
 * Server-authoritative commercial quote.
 * POST /api/company/quote
 */
router.post("/quote", validate(quoteValidation), quoteCommercial);

/**
 * Builder billing / invoice list.
 * GET /api/company/billing
 */
router.get("/billing", getCompanyBilling);

/**
 * Swap request on an active commercial order.
 */
router.post(
  "/orders/:orderId/swap-request",
  validate(swapRequestValidation),
  createSwapRequest,
);
router.put("/orders/:orderId/swap-request", updateSwapRequest);

/**
 * @swagger
 * /api/company/{id}:
 *   put:
 *     summary: Update a company
 *     description: Updates an existing company.
 *     tags: [Company]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 670f3b1b79d84f7f0a2d4e1a
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CreateCompany"
 *           examples:
 *             RequiredOnly:
 *               summary: Example with only required fields
 *               value:
 *                 name: "Acme Corp"
 *                 email: "contact@acme.com"
 *                 phone: "+1234567890"
 *                 EIN: "12-3456789"
 *             MasterExample:
 *               summary: Master example with all possible fields
 *               value:
 *                 name: "Full Service Company"
 *                 email: "admin@fullservice.com"
 *                 phone: "+1122334455"
 *                 EIN: "11-2233445"
 *                 taxInfo: "TAX-123456"
 *                 address: "123 Main St"
 *                 city: "New York"
 *                 state: "NY"
 *                 zip: "10001"
 *                 country: "USA"
 *                 COI: "https://example.com/coi.pdf"
 *                 W9: "https://example.com/w9.pdf"
 *                 onBoardingDocs: "https://example.com/docs.pdf"
 *                 logo: "https://example.com/logo.png"
 *                 primaryContact:
 *                   name: "John Doe"
 *                   email: "john@fullservice.com"
 *                   phone: "+1122334455"
 *                   title: "CEO"
 *                 accountsPayableEmail: "ap@fullservice.com"
 *                 expectedMonthlyVolume: 5000
 *                 PO: true
 *                 taxExempt: "EXEMPT-999"
 *                 authorizedSigner:
 *                   name: "Jane Smith"
 *                   email: "jane@fullservice.com"
 *                   phone: "+1122334466"
 *                   title: "CFO"
 *     responses:
 *       200:
 *         description: Company updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CompanyResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequestError"
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       404:
 *         $ref: "#/components/responses/NotFoundError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
router.put("/:id", validate(updateCompanyValidation), updateCompany);

/**
 * @swagger
 * tags:
 *   name: Company Admin Side
 *   description: Company admin side management
 */
router.use(admin);

/**
 * @swagger
 * /api/company/admin:
 *   get:
 *     summary: Get all companies
 *     description: Retrieves a paginated list of all companies.
 *     tags: [Company Admin Side]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: "Acme"
 *         description: Search term
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ["pending", "approved", "rejected"]
 *           example: "pending"
 *         description: Filter by status
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           example: "[EMAIL_ADDRESS]"
 *         description: Filter by email
 *       - in: query
 *         name: phone
 *         schema:
 *           type: string
 *           example: "+1234567890"
 *         description: Filter by phone
 *     responses:
 *       200:
 *         description: Successfully retrieved companies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Companies fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "670f3b1b79d84f7f0a2d4e1a"
 *                           name:
 *                             type: string
 *                             example: "Acme Corp"
 *                           email:
 *                             type: string
 *                             example: "[EMAIL_ADDRESS]"
 *                           phone:
 *                             type: string
 *                             example: "+1234567890"
 *                           status:
 *                             type: string
 *                             example: "active"
 *                           user:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "670f3b1b79d84f7f0a2d4e1a"
 *                               name:
 *                                 type: string
 *                                 example: "John Doe"
 *                               email:
 *                                 type: string
 *                                 example: "[EMAIL_ADDRESS]"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total:
 *                           type: integer
 *                           example: 50
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
router.get("/admin", getAllCompanies);
router.get("/admin/:id", getCompanyByIdAdmin);

/**
 * @swagger
 * /api/company/admin/{id}/status:
 *   put:
 *     summary: Update company status
 *     description: Updates the status of a specific company.
 *     tags: [Company Admin Side]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "670f3b1b79d84f7f0a2d4e1a"
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
 *                 enum: ["pending", "approved", "rejected"]
 *                 description: The new status of the company
 *                 example: "approved"
 *               isCOIApproved:
 *                 type: boolean
 *                 description: Approval status of the Certificate of Insurance (COI)
 *                 example: true
 *               COI_notes:
 *                 type: string
 *                 description: Admin notes regarding the COI
 *                 example: "COI verified and matches requirements."
 *               isW9Approved:
 *                 type: boolean
 *                 description: Approval status of the W9 document
 *                 example: true
 *               W9_notes:
 *                 type: string
 *                 description: Admin notes regarding the W9 document
 *                 example: "W9 verified successfully."
 *               reason:
 *                 type: string
 *                 description: Overall reason or note for the status update (typically used for rejection)
 *                 example: ""
 *           examples:
 *             approved:
 *               summary: Approved Example
 *               value:
 *                 status: "approved"
 *                 isCOIApproved: true
 *                 COI_notes: "COI verified and matches requirements."
 *                 isW9Approved: true
 *                 W9_notes: "W9 verified successfully."
 *                 reason: ""
 *             rejected:
 *               summary: Rejected Example
 *               value:
 *                 status: "rejected"
 *                 isCOIApproved: false
 *                 COI_notes: "COI document is expired."
 *                 isW9Approved: false
 *                 W9_notes: "W9 information is incomplete."
 *                 reason: "Submitted documents do not meet onboarding requirements."
 *     responses:
 *       200:
 *         description: Company status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CompanyResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequestError"
 *       401:
 *         $ref: "#/components/responses/UnauthorizedError"
 *       404:
 *         $ref: "#/components/responses/NotFoundError"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
router.put(
  "/admin/:id/status",
  validate(adminUpdateCompanyStatusValidation),
  adminUpdateCompanyStatus,
);

export default router;
