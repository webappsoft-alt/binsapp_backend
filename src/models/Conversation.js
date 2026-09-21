import mongoose from "mongoose";
const { Schema, model } = mongoose;

const conversationSchema = new Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],
  messages: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
  ],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
  },
  lastActivity: {
    type: Date,
    default: Date.now,
  },


  // Optional: Service-specific metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map(),
  },
  // Conversation status
  status: {
    type: String,
    enum: ["active", "archived", "closed"],
    default: "active",
    index: true,
  },
});

// Indexes for better query performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastActivity: -1 });
conversationSchema.index({ serviceType: 1, participants: 1 });
conversationSchema.index({ serviceType: 1, status: 1 });
conversationSchema.index({ serviceReference: 1 });
conversationSchema.index({ status: 1, lastActivity: -1 });

const Conversation = model("Conversation", conversationSchema);

export default Conversation;
