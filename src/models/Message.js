import mongoose from "mongoose";
const { Schema, model } = mongoose;

const messageSchema = new Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  content: {
    type: String,
    required: function () {
      return this.type === "text";
    },
  },
  type: {
    type: String,
    enum: ["text", "image", "voice", "file"],
    default: "text",
    required: true,
  },
  // File attachment details for non-text messages
  attachment: {
    url: {
      type: String,
      required: function () {
        return ["image", "voice", "file"].includes(this.type);
      },
    },
    filename: {
      type: String,
      required: function () {
        return ["image", "voice", "file"].includes(this.type);
      },
    },
    mimetype: {
      type: String,
      required: function () {
        return ["image", "voice", "file"].includes(this.type);
      },
    },
    size: {
      type: Number,
      // required: function () {
      //   return ["image", "voice", "file"].includes(this.type);
      // },
    },
    // For voice messages
    duration: {
      type: Number,
      required: function () {
        return this.type === "voice";
      },
    },
    // For images
    dimensions: {
      width: {
        type: Number,
        // required: function() {
        //   return this.type === "image";
        // },
      },
      height: {
        type: Number,
        // required: function() {
        //   return this.type === "image";
        // },
      },
    },
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  // Message status tracking
  status: {
    type: String,
    enum: ["sent", "delivered", "read"],
    default: "sent",
  },
  // For voice messages - whether it's been played
  played: {
    type: Boolean,
    default: false,
  },
  // For images - thumbnail URL (optional)
  thumbnail: {
    type: String,
  },
  // Message reply reference
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null,
  },
  // Message reactions - stored as Map for O(1) access
  reactions: {
    type: Map,
    of: {
      type: Map,
      of: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    default: new Map(),
  },
  // Delivery and read status tracking
  deliveryStatus: {
    sent: {
      type: Boolean,
      default: true,
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  // Message metadata for performance
  metadata: {
    replyCount: {
      type: Number,
      default: 0,
    },
    reactionCount: {
      type: Number,
      default: 0,
    },
  },
});

// Indexes for better query performance
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ type: 1 });
messageSchema.index({ replyTo: 1 });
messageSchema.index({ "deliveryStatus.read": 1 });
messageSchema.index({ "deliveryStatus.delivered": 1 });

const Message = model("Message", messageSchema);

export default Message;
