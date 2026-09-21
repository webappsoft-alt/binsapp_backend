import {
  userInfoController,
  updatePasswordController,
  updateProfileController,
  deleteUserController,
  updateStatsController,
  updateLatLongsController,
} from "./controller.js";
import express from "express";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { registerSchema } from "./validation.js";
const router = express.Router();

router.use(authenticate);
/**
 * @swagger
 * /api/user/me:
 *   get:
 *     summary: Get current authenticated user info
 *     tags: [User]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user profile
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
 *                     _id:
 *                       type: string
 *                       example: 60ae0d9f5b6c3c001c8f1234
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: john@example.com
 *                     role:
 *                       type: string
 *                       example: user
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

router.get("/me", userInfoController);

/**
 * @swagger
 * /api/user/profile:
 *   put:
 *     summary: Update authenticated user's profile
 *     description: Updates the authenticated user's profile information. All fields are required as per validation schema.
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's full name
 *                 example: John Doe
 *               profilePicture:
 *                 type: string
 *                 description: URL to user's profile picture
 *                 example: https://example.com/profile.jpg
 *               comp_name:
 *                 type: string
 *                 description: Company name
 *                 example: Acme Corporation
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: john.doe@example.com
 *               fcmtoken:
 *                 type: string
 *                 description: Firebase Cloud Messaging token
 *                 example: dXJhbmRvbV9mY21fdG9rZW4=
 *               lat:
 *                 type: number
 *                 description: Latitude coordinate
 *                 example: 40.7128
 *               lng:
 *                 type: number
 *                 description: Longitude coordinate
 *                 example: -74.0060
 *               address:
 *                 type: string
 *                 description: Full address
 *                 example: 123 Main St, New York, NY 10001
 *               status:
 *                 type: string
 *                 description: User account status
 *                 enum: [active, inactive, deleted, deactivated]
 *                 example: active
 *               driving_license:
 *                 type: string
 *                 description: Driving license number or URL to license document
 *                 example: DL123456789
 *               type:
 *                 type: string
 *                 description: User type/role
 *                 enum: [user, admin, superadmin, driver]
 *                 example: user
 *               radius:
 *                 type: number
 *                 description: Service radius in miles
 *                 example: 50
 *               company_id:
 *                 type: object
 *                 description: Company profile information associated with the user
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: Company name
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: Company email address
 *                   phone:
 *                     type: string
 *                     description: Company phone number
 *                   taxInfo:
 *                     type: string
 *                     description: Tax status or details
 *                   address:
 *                     type: string
 *                     description: Street address
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zip:
 *                     type: string
 *                   country:
 *                     type: string
 *                   COI:
 *                     type: string
 *                     description: URL to Certificate of Insurance
 *                   W9:
 *                     type: string
 *                     description: URL to W9 document
 *                   onBoardingDocs:
 *                     type: string
 *                     description: URL to onboarded documents
 *                   logo:
 *                     type: string
 *                     description: URL to company logo
 *                   EIN:
 *                     type: string
 *                     description: Employer Identification Number
 *                   primaryContact:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                         format: email
 *                       phone:
 *                         type: string
 *                       title:
 *                         type: string
 *                   accountsPayableEmail:
 *                     type: string
 *                     format: email
 *                   expectedMonthlyVolume:
 *                     type: number
 *                   PO:
 *                     type: boolean
 *                   taxExempt:
 *                     type: string
 *                   authorizedSigner:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                         format: email
 *                       phone:
 *                         type: string
 *                       title:
 *                         type: string
 *               junkRemoval:
 *                 type: object
 *                 required: [companyName, legalBusinessName, sameDayAvailable, ein]
 *                 properties:
 *                   companyName:
 *                     type: string
 *                   legalBusinessName:
 *                     type: string
 *                   sameDayAvailable:
 *                     type: boolean
 *                   ein:
 *                     type: string
 *                   drivers_license:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: URLs to driving license images
 *                   COI:
 *                     type: string
 *                     description: URL to Certificate of Insurance
 *                   Business_license:
 *                     type: string
 *                     description: URL to Business License
 *                   minimum_insurance_amount:
 *                     type: number
 *               treeRemoval:
 *                 type: object
 *                 required: [companyName, legalBusinessName, sameDayAvailable, ein]
 *                 properties:
 *                   companyName:
 *                     type: string
 *                   legalBusinessName:
 *                     type: string
 *                   sameDayAvailable:
 *                     type: boolean
 *                   ein:
 *                     type: string
 *                   drivers_license:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: URLs to driving license images
 *                   COI:
 *                     type: string
 *                     description: URL to Certificate of Insurance
 *                   License_Type:
 *                     type: string
 *                   License_Number:
 *                     type: string
 *                   License_State:
 *                     type: string
 *                   License_Expiration:
 *                     type: string
 *                   Tree_removal_license:
 *                     type: string
 *                     description: URL to Tree Removal License
 *                   Workers_comp:
 *                     type: string
 *                     description: URL to Workers Compensation document
 *                   Certified_arborist:
 *                     type: boolean
 *                     description: Whether the user is a certified arborist
 *                   Arborist_credential:
 *                     type: string
 *           examples:
 *             MasterExample:
 *               summary: Master example with all possible keys
 *               value:
 *                 name: Master User
 *                 profilePicture: https://example.com/master.jpg
 *                 comp_name: All Services Corp
 *                 email: master@example.com
 *                 fcmtoken: master_fcm_token_123
 *                 lat: 40.7128
 *                 lng: -74.0060
 *                 address: 789 Master Blvd, New York, NY 10001
 *                 status: active
 *                 driving_license: DL999999999
 *                 type: superadmin
 *                 radius: 100
 *                 junkRemoval:
 *                   companyName: Junk Busters Corp
 *                   legalBusinessName: Junk Busters LLC
 *                   sameDayAvailable: true
 *                   ein: "12-3456789"
 *                   drivers_license: ["https://example.com/junk_dl.jpg"]
 *                   COI: https://example.com/junk_coi.pdf
 *                   Business_license: https://example.com/junk_biz.jpg
 *                   minimum_insurance_amount: 1000000
 *                 treeRemoval:
 *                   companyName: Tree Experts Corp
 *                   legalBusinessName: Tree Experts LLC
 *                   sameDayAvailable: false
 *                   ein: "98-7654321"
 *                   drivers_license: ["https://example.com/tree_dl.jpg"]
 *                   COI: https://example.com/tree_coi.pdf
 *                   License_Type: Commercial
 *                   License_Number: TRE123456
 *                   License_State: NY
 *                   License_Expiration: "2025-12-31"
 *                   Tree_removal_license: https://example.com/tree_lic.jpg
 *                   Workers_comp: https://example.com/workers_comp.pdf
 *                   Certified_arborist: true
 *                   Arborist_credential: ISA-12345
 *             JunkRemoval:
 *               summary: Example for Junk Removal service provider
 *               value:
 *                 name: John Junk
 *                 profilePicture: https://example.com/junk.jpg
 *                 comp_name: Junk Busters
 *                 email: junk@example.com
 *                 fcmtoken: dXJhbmRvbV9mY21fdG9rZW4=
 *                 lat: 40.7128
 *                 lng: -74.0060
 *                 address: 123 Junk St, New York, NY 10001
 *                 status: active
 *                 driving_license: DL123456789
 *                 type: driver
 *                 radius: 50
 *                 junkRemoval:
 *                   companyName: Junk Busters Corp
 *                   legalBusinessName: Junk Busters LLC
 *                   sameDayAvailable: true
 *                   ein: "12-3456789"
 *                   drivers_license: ["https://example.com/dl1.jpg", "https://example.com/dl2.jpg"]
 *                   COI: https://example.com/coi.pdf
 *                   Business_license: https://example.com/biz_lic.jpg
 *             TreeRemoval:
 *               summary: Example for Tree Removal service provider
 *               value:
 *                 name: Jane Tree
 *                 profilePicture: https://example.com/tree.jpg
 *                 comp_name: Tree Experts
 *                 email: tree@example.com
 *                 fcmtoken: dXJhbmRvbV9mY21fdG9rZW4=
 *                 lat: 34.0522
 *                 lng: -118.2437
 *                 address: 456 Tree Ln, Los Angeles, CA 90001
 *                 status: active
 *                 driving_license: DL987654321
 *                 type: driver
 *                 radius: 30
 *                 treeRemoval:
 *                   companyName: Tree Experts Corp
 *                   legalBusinessName: Tree Experts LLC
 *                   sameDayAvailable: false
 *                   ein: "98-7654321"
 *                   drivers_license: ["https://example.com/tree_dl1.jpg"]
 *                   COI: https://example.com/tree_coi.pdf
 *                   Tree_removal_license: https://example.com/tree_lic.jpg
 *                   Workers_comp: https://example.com/workers_comp.pdf
 *                   Certified_arborist: true
 *             Company:
 *               summary: Example for Company profile update
 *               value:
 *                 name: Jane Business
 *                 profilePicture: https://example.com/jane_biz.jpg
 *                 comp_name: Acme Enterprise
 *                 email: jane.business@example.com
 *                 fcmtoken: company_fcm_token_xyz
 *                 lat: 40.7128
 *                 lng: -74.0060
 *                 address: 456 Enterprise Way, New York, NY 10001
 *                 status: active
 *                 driving_license: DL888888888
 *                 type: user
 *                 radius: 15
 *                 company_id:
 *                   name: Acme Enterprise Inc.
 *                   email: contact@acmeenterprise.com
 *                   phone: "+15551234567"
 *                   taxInfo: "Tax Liable"
 *                   address: "456 Enterprise Way"
 *                   city: "New York"
 *                   state: "NY"
 *                   zip: "10001"
 *                   country: "USA"
 *                   COI: "https://example.com/acme_coi.pdf"
 *                   W9: "https://example.com/acme_w9.pdf"
 *                   onBoardingDocs: "https://example.com/acme_onboarding.pdf"
 *                   logo: "https://example.com/acme_logo.png"
 *                   EIN: "12-9876543"
 *                   primaryContact:
 *                     name: "John Smith"
 *                     email: "jsmith@acmeenterprise.com"
 *                     phone: "+15559876543"
 *                     title: "Operations Manager"
 *                   accountsPayableEmail: "ap@acmeenterprise.com"
 *                   expectedMonthlyVolume: 5000
 *                   PO: true
 *                   taxExempt: "No"
 *                   authorizedSigner:
 *                     name: "Jane Business"
 *                     email: "jane.business@example.com"
 *                     phone: "+15551234567"
 *                     title: "CEO"
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   example: Profile updated successfully
 *                 user:
 *                   type: object
 *                   description: Updated user object with all profile information
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.put("/profile", validate(registerSchema), updateProfileController);

/**
 * @swagger
 * /api/user/status:
 *   put:
 *     summary: Update user status and statistics
 *     description: Updates the authenticated user's availability status or other statistical fields.
 *     tags: [User]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [online, offline]
 *                 example: "online"
 *     responses:
 *       200:
 *         description: Stats updated successfully
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
 *                   example: Stats updated successfully
 *                 stats:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
router.put("/status", updateStatsController);

/**
 * @swagger
 * /api/user/:
 *   delete:
 *     summary: Delete authenticated user account
 *     description: Soft deletes the authenticated user's account by marking it as deleted, appending random strings to email and phone to allow re-registration, and deactivating all associated dustbins.
 *     tags:
 *       - User
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User account deleted successfully
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
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Internal server error
 */
router.delete("/", deleteUserController);

/**
 * @swagger
 * /api/user/latlongs:
 *   put:
 *     summary: Update user latitude and longitude
 *     description: Updates the authenticated user's latitude and longitude coordinates.
 *     tags: [User]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentlat:
 *                 type: number
 *                 description: Latitude coordinate
 *                 example: 40.7128
 *               currentlng:
 *                 type: number
 *                 description: Longitude coordinate
 *                 example: -74.0060
 *     responses:
 *       200:
 *         description: Location updated successfully
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
 *                   example: Location updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
router.put("/latlongs", updateLatLongsController);

export default router;
