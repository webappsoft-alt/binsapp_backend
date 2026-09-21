import {
  getConversations,
  getMessages,
  getConversationsbyAdmin,
  getMessagesByAdmin,
} from "./controller.js";
import express from "express";
import { admin, authenticate, subUser } from "../../middlewares/auth.js";

const router = express.Router();
// router.use([authenticate, subUser]);

/**
 * @swagger
 * tags:
 *   name: Conversations
 *   description: User conversation management
 */
/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Conversation:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439011
 *         participants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *         lastMessage:
 *           $ref: '#/components/schemas/Message'
 *         type:
 *           type: string
 *           enum: [ "rentee", "renter"]
 *           example: trips
 *           description: Type of service for conversation filtering
 *         serviceReference:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439012
 *           description: Reference to the specific service/order
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *           example:
 *             orderId: "ORD-12345"
 *             priority: "high"
 *           description: Service-specific metadata
 *         status:
 *           type: string
 *           enum: [active, archived, closed]
 *           example: active
 *           description: Conversation status
 *         lastActivity:
 *           type: string
 *           format: date-time
 *           example: "2023-01-15T10:30:00Z"
 *           description: Last activity timestamp
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439012
 *         username:
 *           type: string
 *           example: johndoe
 *         profilePic:
 *           type: string
 *           format: uri
 *           example: https://example.com/profile.jpg
 *         status:
 *           type: string
 *           enum: [online, offline, away]
 *           example: online
 *         lastSeen:
 *           type: string
 *           format: date-time
 *     Message:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439013
 *         senderId:
 *           $ref: '#/components/schemas/User'
 *         receiverId:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439012
 *         conversationId:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439014
 *         content:
 *           type: string
 *           example: Hello there!
 *           description: Text content (required for text messages)
 *         type:
 *           type: string
 *           enum: [text, image, voice, file]
 *           example: text
 *           description: Type of message
 *         attachment:
 *           type: object
 *           description: File attachment details (for non-text messages)
 *           properties:
 *             url:
 *               type: string
 *               format: uri
 *               example: "https://storage.googleapis.com/bucket/uploads/chat/image_123.jpg"
 *             filename:
 *               type: string
 *               example: "image_123.jpg"
 *             mimetype:
 *               type: string
 *               example: "image/jpeg"
 *             size:
 *               type: number
 *               example: 1024000
 *             duration:
 *               type: number
 *               example: 15.5
 *               description: Duration in seconds (for voice messages)
 *             dimensions:
 *               type: object
 *               description: Image dimensions (for image messages)
 *               properties:
 *                 width:
 *                   type: number
 *                   example: 1920
 *                 height:
 *                   type: number
 *                   example: 1080
 *         thumbnail:
 *           type: string
 *           format: uri
 *           example: "https://storage.googleapis.com/bucket/uploads/chat/thumb_image_123.jpg"
 *           description: Thumbnail URL (for image messages)
 *         status:
 *           type: string
 *           enum: [sent, delivered, read]
 *           example: sent
 *         played:
 *           type: boolean
 *           example: false
 *           description: Whether voice message has been played
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2023-01-15T10:30:00Z"
 *         replyTo:
 *           type: string
 *           format: objectId
 *           example: "507f1f77bcf86cd799439015"
 *           description: Reference to the original message being replied to
 *         reactions:
 *           type: object
 *           additionalProperties:
 *             type: object
 *             additionalProperties:
 *               type: string
 *               format: objectId
 *           example:
 *             "👍":
 *               "user1": "507f1f77bcf86cd799439011"
 *               "user2": "507f1f77bcf86cd799439012"
 *             "❤️":
 *               "user1": "507f1f77bcf86cd799439011"
 *           description: Emoji reactions with user IDs
 *         deliveryStatus:
 *           type: object
 *           properties:
 *             sent:
 *               type: boolean
 *               example: true
 *             delivered:
 *               type: boolean
 *               example: true
 *             read:
 *               type: boolean
 *               example: false
 *             readAt:
 *               type: string
 *               format: date-time
 *               example: "2023-01-15T10:35:00Z"
 *             deliveredAt:
 *               type: string
 *               format: date-time
 *               example: "2023-01-15T10:32:00Z"
 *         metadata:
 *           type: object
 *           properties:
 *             replyCount:
 *               type: number
 *               example: 3
 *               description: Number of replies to this message
 *             reactionCount:
 *               type: number
 *               example: 5
 *               description: Total number of reactions on this message
 *     Pagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           example: 100
 *         page:
 *           type: integer
 *           example: 2
 *         limit:
 *           type: integer
 *           example: 20
 *         totalPages:
 *           type: integer
 *           example: 5
 *         hasNextPage:
 *           type: boolean
 *           example: true
 *         hasPreviousPage:
 *           type: boolean
 *           example: true
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           example: Invalid user ID format
 */

/**
 * @swagger
 * /api/conversations/{userId}:
 *   get:
 *     summary: Get all conversations for a user
 *     description: |
 *       Retrieves paginated conversations for the authenticated user.
 *       - Returns conversation list with participants and last message details
 *       - Supports pagination and minimal response format
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: objectId
 *         description: ID of the user whose conversations to retrieve
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Number of conversations per page (max 50)
 *       - in: query
 *         name: minimal
 *         schema:
 *           type: boolean
 *           default: false
 *         description: |
 *           If true, returns minimal response without populating participants and last message.
 *           Useful for reducing payload size when only basic conversation info is needed.
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ "rentee", "renter"]
 *         description: Filter conversations by service type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, closed]
 *           default: active
 *         description: Filter conversations by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search conversations by participant name or message content
 *     responses:
 *       200:
 *         description: Successful operation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (user trying to access other user's conversations)
 *       500:
 *         description: Internal server error
 */

router.get("/:userId", authenticate, getConversations);

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439011
 *         username:
 *           type: string
 *           example: johndoe
 *         profilePic:
 *           type: string
 *           format: uri
 *           example: https://example.com/profile.jpg
 *
 *     Message:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439011
 *         content:
 *           type: string
 *           example: Hello there!
 *         sender:
 *           $ref: '#/components/schemas/User'
 *         conversation:
 *           type: string
 *           format: objectId
 *         messageType:
 *           type: string
 *           enum: [text, image, video, system]
 *           example: text
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     ConversationInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: objectId
 *           example: 507f1f77bcf86cd799439011
 *         type:
 *           type: string
 *           enum: [direct, group, broadcast, channel, individual]
 *           example: direct
 *         name:
 *           type: string
 *           nullable: true
 *           example: "Group Chat"
 *         participants:
 *           type: integer
 *           example: 3
 *           description: Number of active participants
 *
 *     Pagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           example: 100
 *         page:
 *           type: integer
 *           example: 2
 *         limit:
 *           type: integer
 *           example: 20
 *         totalPages:
 *           type: integer
 *           example: 5
 *         hasNextPage:
 *           type: boolean
 *           example: true
 *         hasPreviousPage:
 *           type: boolean
 *           example: true
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           example: Invalid request parameters
 *
 *   parameters:
 *     conversationIdParam:
 *       in: path
 *       name: conversationId
 *       required: true
 *       schema:
 *         type: string
 *         format: objectId
 *       description: ID of the conversation
 *
 *   responses:
 *     UnauthorizedError:
 *       description: Access token is missing or invalid
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: Unauthorized access
 *
 *     ForbiddenError:
 *       description: User doesn't have permission
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: Not a conversation participant
 */

/**
 * @swagger
 * /api/conversations/{conversationId}/messages:
 *   get:
 *     tags: [Messages]
 *     summary: Get conversation messages
 *     description: Retrieve paginated messages from a conversation with filtering options
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/conversationIdParam'
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Messages per page
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter messages before this timestamp
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter messages after this timestamp
 *       - in: query
 *         name: includeSystem
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include system messages
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order by creation time
 *     responses:
 *       200:
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *                 conversationInfo:
 *                   $ref: '#/components/schemas/ConversationInfo'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Conversation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: Conversation not found
 *       429:
 *         description: Too many requests
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: Internal server error
 */

router.get("/:conversationId/messages", authenticate, getMessages);

/**
 * @swagger
 * /api/conversations/assign/{userId}:
 *   get:
 *     summary: Get all conversations for a user
 *     description: |
 *       Retrieves paginated conversations for the authenticated user.
 *       - Returns conversation list with participants and last message details
 *       - Supports pagination and minimal response format
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: objectId
 *         description: ID of the user whose conversations to retrieve
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Number of conversations per page (max 50)
 *       - in: query
 *         name: minimal
 *         schema:
 *           type: boolean
 *           default: false
 *         description: |
 *           If true, returns minimal response without populating participants and last message.
 *           Useful for reducing payload size when only basic conversation info is needed.
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ "rentee", "renter"]
 *         description: Filter conversations by service type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, closed]
 *           default: active
 *         description: Filter conversations by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search conversations by participant name or message content
 *     responses:
 *       200:
 *         description: Successful operation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (user trying to access other user's conversations)
 *       500:
 *         description: Internal server error
 */
router.get("/assign/:userId", subUser, getConversations);

/**
 * @swagger
 * /api/conversations/assign/{conversationId}/messages:
 *   get:
 *     tags: [Messages]
 *     summary: Get conversation messages
 *     description: Retrieve paginated messages from a conversation with filtering options
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/conversationIdParam'
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Messages per page
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter messages before this timestamp
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter messages after this timestamp
 *       - in: query
 *         name: includeSystem
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include system messages
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order by creation time
 *     responses:
 *       200:
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *                 conversationInfo:
 *                   $ref: '#/components/schemas/ConversationInfo'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Conversation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: Conversation not found
 *       429:
 *         description: Too many requests
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: Internal server error
 */

router.get("/assign/:conversationId/messages", subUser, getMessages);

/**
 * @swagger
 * /api/conversations/admin/conversations:
 *   get:
 *     summary: Get all user conversations (Admin only)
 *     description: Retrieve paginated conversations across all users with filters for search, status, and role type.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
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
 *           default: 20
 *           maximum: 50
 *         description: Number of conversations per page
 *       - in: query
 *         name: minimal
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "false"
 *         description: Set to true for minimal payload excluding detailed user references
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [rentee, renter]
 *         description: Filter conversations by participant user role
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, closed]
 *           default: active
 *         description: Filter conversations by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query to filter users by name, email, or phone
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *                 totalUnreadCount:
 *                   type: integer
 *                   example: 5
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 100
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     hasNextPage:
 *                       type: boolean
 *                       example: true
 *                     hasPreviousPage:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Admin authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/admin/conversations",
  [authenticate, admin],
  getConversationsbyAdmin,
);

/**
 * @swagger
 * /api/conversations/admin/{conversationId}/messages:
 *   get:
 *     summary: Get conversation messages (Admin only)
 *     description: Retrieve paginated messages for any specific conversation by conversationId.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: objectId
 *         description: MongoDB ObjectId of the conversation
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
 *           default: 50
 *           maximum: 100
 *         description: Number of messages per page
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter messages sent before this ISO 8601 timestamp
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter messages sent after this ISO 8601 timestamp
 *       - in: query
 *         name: includeSystem
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include system messages
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include deleted messages
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction by message timestamp
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 45
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 50
 *                     totalPages:
 *                       type: integer
 *                       example: 1
 *                     hasNextPage:
 *                       type: boolean
 *                       example: false
 *                     hasPreviousPage:
 *                       type: boolean
 *                       example: false
 *                 conversationInfo:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 507f1f77bcf86cd799439011
 *                     participants:
 *                       type: integer
 *                       example: 2
 *       400:
 *         description: Invalid conversation ID format or query parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Admin authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/admin/:conversationId/messages",
  [authenticate, admin],
  getMessagesByAdmin,
);

export default router;
