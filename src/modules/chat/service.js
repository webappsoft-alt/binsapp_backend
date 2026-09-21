import Conversation from "../../models/Conversation.js";
import mongoose from "mongoose";
import User from "../../models/user.js";
import Message from "../../models/Message.js";

/**
 * Service to get all conversations for a user with pagination and population
 * @param {string} userId - The ID of the user whose conversations to retrieve
 * @param {Object} options - Additional options for the query
 * @param {number} [options.page=1] - Page number for pagination
 * @param {number} [options.limit=20] - Number of conversations per page
 * @param {boolean} [options.populateParticipants=true] - Whether to populate participant details
 * @param {boolean} [options.populateLastMessage=true] - Whether to populate the last message
 * @param {string} [options.serviceType] - Filter by service type (trips, shippings, parkings, rentals, tours)
 * @param {string} [options.status] - Filter by conversation status (active, archived, closed)
 * @returns {Promise<Object>} - Returns an object containing conversations and pagination info
 */

export async function getAllConversations(userId, options = {}) {
  try {
    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }
    const userIdObj = new mongoose.Types.ObjectId(userId);
    // console.log("userIdObj", userIdObj);
    // Set default options
    const {
      page = 1,
      limit = 20,
      includeUserDetails = true, // New option to control user details
      type,
      search,
      status = "active", // Filter by conversation status
    } = options;

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Build population options based on includeUserDetails flag
    const populationOptions = [
      {
        path: "participants",
      },
      {
        path: "messages",
      },
    ];

    if (includeUserDetails) {
      populationOptions.push({
        path: "lastMessage",
        populate: {
          path: "senderId",
        },
      });
    } else {
      populationOptions.push({
        path: "lastMessage",
      });
    }

    // Build query filters
    const queryFilters = {
      status: status,
    };
    if (type) {
      const users = await User.find({
        role: type,
      })
        .select("_id")
        .lean();
      const otherUserIdArray = users.map((user) => user._id);

      queryFilters.participants = {
        $all: [userIdObj],
        $in: otherUserIdArray,
      };
    } else if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ],
      })
        .select("_id")
        .lean();
      const otherUserIdArray = users.map((user) => user._id);

      queryFilters.participants = {
        $all: [userIdObj],
        $in: otherUserIdArray,
      };
    } else {
      queryFilters.participants = { $in: [userIdObj] };
    }

    // // Add service type filter if provided
    // if (serviceType) {
    //   queryFilters.serviceType = serviceType;
    // }

    // Query construction
    const query = Conversation.find(queryFilters)
      .populate(populationOptions)
      .sort({ lastActivity: -1 })
      .skip(skip)
      .limit(limit);

    // Execute the query
    const conversations = await query.exec();
    // Update all messages status deleverd

    await Message.updateMany(
      { receiverId: userIdObj, "deliveryStatus.delivered": false },
      {
        "deliveryStatus.delivered": true,
        "deliveryStatus.deliveredAt": new Date(),
      },
    );

    // Process conversations to extract other user info
    const processedConversations = conversations.map((conversation) => {
      // Find the other participant (not the current user)
      const otherUser = conversation.participants.find(
        (participant) => !participant._id.equals(userIdObj),
      );
      // console.log(" conversation.messages?",  conversation.messages);
      const unreadCount = conversation.messages?.filter(
        (message) =>
          message.deliveryStatus?.read === false &&
          message.senderId.toString() !== userIdObj.toString(),
      ).length;
      // console.log("unreadCount", unreadCount);

      // Return conversation with enhanced info
      return {
        _id: conversation._id,
        participants: conversation.participants,
        lastMessage: conversation.lastMessage,
        unreadCount: unreadCount,
        lastActivity: conversation.lastActivity,
        otherUser: otherUser || null,
        isGroup: conversation.participants.length > 2, // Flag for group chats
      };
    });

    // Get total count for pagination info
    const total = await Conversation.countDocuments(queryFilters);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      conversations: processedConversations,
      totalUnreadCount: processedConversations.reduce(
        (acc, conv) => acc + conv.unreadCount,
        0,
      ),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    console.error("Error in getAllConversations service:", error);
    return {
      success: false,
      error: error.message || "Failed to retrieve conversations",
    };
  }
}

/**
 * Service to get all messages in a conversation
 * @param {string} conversationId - ID of the conversation
 * @param {string} userId - ID of the requesting user (for permission checks)
 * @param {Object} options - Additional options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=50] - Messages per page (max 100)
 * @param {string} [options.before] - Get messages before this date (ISO string)
 * @param {string} [options.after] - Get messages after this date (ISO string)
 * @param {boolean} [options.includeSystem=true] - Include system messages
 * @param {boolean} [options.includeDeleted=false] - Include deleted messages
 * @param {string} [options.sort='desc'] - Sort order ('asc' or 'desc')
 * @returns {Promise<Object>} - Messages with pagination info
 */
export async function getConversationMessages(
  conversationId,
  userId,
  options = {},
) {
  try {
    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new Error("Invalid conversation ID");
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }
    // Set default options
    const {
      page = 1,
      limit = 50,
      before = null,
      after = null,
      sort = "desc",
    } = options;
    const adjustedLimit = Math.min(parseInt(limit), 100);

    const skip = (page - 1) * adjustedLimit;

    const conversationIdObj = new mongoose.Types.ObjectId(conversationId);
    const userIdObj = new mongoose.Types.ObjectId(userId);
    // console.log("userIdObj", userIdObj);

    // Verify user is a participant
    const conversation_Id = await Conversation.findOne({
      participants: {
        $all: [conversationIdObj, userIdObj],
      },
    });
    // console.log(conversation_Id);
    if (!conversation_Id) {
      return {
        success: false,
        error: "There is no conversation between these users",
        messages: [],
      };
    }
    // console.log(conversation_Id._id);

    // Build query
    const conversationWithMessages = await Conversation.findById(
      conversation_Id._id,
    ).populate({
      path: "messages",
      populate: { path: ["senderId", "receiverId"] },
    });

    if (!conversationWithMessages) {
      throw new Error("Conversation not found");
    }

    // Extract and sort messages
    let messages = conversationWithMessages.messages || [];
    await Message.updateMany(
      {
        conversationId: conversation_Id._id,
        receiverId: userIdObj,
        "deliveryStatus.read": false,
      },
      {
        "deliveryStatus.delivered": true,
        "deliveryStatus.read": true,
        "deliveryStatus.readAt": new Date(),
      },
    );
    // Apply timestamp filters
    if (before) {
      messages = messages.filter((msg) => msg.timestamp < new Date(before));
    }
    if (after) {
      messages = messages.filter((msg) => msg.timestamp > new Date(after));
    }

    // Sort messages
    messages.sort((a, b) => {
      return sort === "asc"
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp;
    });

    // Apply pagination to the filtered/sorted array
    const total = messages.length;
    const paginatedMessages = messages.slice(skip, skip + adjustedLimit);

    // Calculate pagination info
    const totalPages = Math.ceil(total / adjustedLimit);

    return {
      success: true,
      messages: paginatedMessages,
      pagination: {
        total,
        page,
        limit: adjustedLimit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      conversationInfo: {
        id: conversationWithMessages._id,
        participants: conversationWithMessages.participants.length,
      },
    };
  } catch (error) {
    console.error("Error in getConversationMessages:", error);
    return {
      success: false,
      error: error.message || "Failed to retrieve messages",
    };
  }
}

export async function getAllConversationsbyAdmin(options = {}, userId) {
  try {
    // Set default options
    const {
      page = 1,
      limit = 20,
      includeUserDetails = true, // Option to control user details
      type,
      search,
      status = "active", // Filter by conversation status
    } = options;

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Build population options based on includeUserDetails flag
    const populationOptions = [
      {
        path: "participants",
      },
      {
        path: "messages",
      },
    ];

    if (includeUserDetails) {
      populationOptions.push({
        path: "lastMessage",
        populate: {
          path: "senderId",
        },
      });
    } else {
      populationOptions.push({
        path: "lastMessage",
      });
    }

    // Build query filters
    const queryFilters = {
      status: status,
    };

    if (userId) {
      queryFilters.participants = { $ne: userId };
    }

    if (type) {
      const users = await User.find({
        role: type,
      })
        .select("_id")
        .lean();
      const otherUserIdArray = users.map((user) => user._id);

      queryFilters.participants = {
        $in: otherUserIdArray,
      };
    } else if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ],
      })
        .select("_id")
        .lean();
      const otherUserIdArray = users.map((user) => user._id);

      queryFilters.participants = {
        $in: otherUserIdArray,
      };
    }

    // Query construction
    const query = Conversation.find(queryFilters)
      .populate(populationOptions)
      .sort({ lastActivity: -1 })
      .skip(skip)
      .limit(limit);

    // Execute the query
    const conversations = await query.exec();

    // Process conversations to extract unread count and details
    const processedConversations = conversations.map((conversation) => {
      const unreadCount =
        conversation.messages?.filter(
          (message) => message.deliveryStatus?.read === false,
        ).length || 0;

      // Return conversation with enhanced info
      return {
        _id: conversation._id,
        participants: conversation.participants,
        lastMessage: conversation.lastMessage,
        unreadCount: unreadCount,
        lastActivity: conversation.lastActivity,
        isGroup: conversation.participants.length > 2, // Flag for group chats
      };
    });

    // Get total count for pagination info
    const total = await Conversation.countDocuments(queryFilters);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      conversations: processedConversations,
      totalUnreadCount: processedConversations.reduce(
        (acc, conv) => acc + conv.unreadCount,
        0,
      ),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    throw error;
  }
}

export async function getConversationMessagesByAdmin(
  conversationId,
  options = {},
) {
  try {
    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new Error("Invalid conversation ID");
    }

    // Set default options
    const {
      page = 1,
      limit = 50,
      before = null,
      after = null,
      sort = "desc",
    } = options;
    const adjustedLimit = Math.min(parseInt(limit), 100);

    const skip = (page - 1) * adjustedLimit;

    const conversationIdObj = new mongoose.Types.ObjectId(conversationId);

    // Verify conversation exists
    const conversation_Id = await Conversation.findById(conversationIdObj);
    if (!conversation_Id) {
      return {
        success: false,
        error: "Conversation not found",
        messages: [],
      };
    }

    // Build query with populated messages and user references
    const conversationWithMessages = await Conversation.findById(
      conversation_Id._id,
    ).populate({
      path: "messages",
      populate: [{ path: "senderId" }, { path: "receiverId" }],
    });

    if (!conversationWithMessages) {
      throw new Error("Conversation not found");
    }

    // Extract and sort messages
    let messages = conversationWithMessages.messages || [];

    // Apply timestamp filters
    if (before) {
      const beforeTime = new Date(before).getTime();
      messages = messages.filter((msg) => {
        const msgTime = new Date(msg.createdAt || msg.timestamp).getTime();
        return msgTime < beforeTime;
      });
    }
    if (after) {
      const afterTime = new Date(after).getTime();
      messages = messages.filter((msg) => {
        const msgTime = new Date(msg.createdAt || msg.timestamp).getTime();
        return msgTime > afterTime;
      });
    }

    // Sort messages
    messages.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.timestamp).getTime();
      const timeB = new Date(b.createdAt || b.timestamp).getTime();
      return sort === "asc" ? timeA - timeB : timeB - timeA;
    });

    // Apply pagination to the filtered/sorted array
    const total = messages.length;
    const paginatedMessages = messages.slice(skip, skip + adjustedLimit);

    // Calculate pagination info
    const totalPages = Math.ceil(total / adjustedLimit) || 1;

    return {
      success: true,
      messages: paginatedMessages,
      pagination: {
        total,
        page,
        limit: adjustedLimit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      conversationInfo: {
        id: conversationWithMessages._id,
        participants: conversationWithMessages.participants.length,
      },
    };
  } catch (error) {
    throw error;
  }
}
