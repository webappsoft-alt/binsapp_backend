import mongoose from "mongoose";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import logger from "../config/logger.js";
import { scheduleSidebarCountsBroadcast } from "../modules/admin/sidebarCounts.js";

/**
 * Read receipts.
 *
 * markConversationRead(io, conversationId, readerId)
 *   marks every unread message sent TO `readerId` in the conversation as delivered + read and tells
 *   each sender right away:
 *     "messages:read"  { conversationId, readerId, messageIds, readAt }   (batch, to user_<sender>)
 *     "message:status" { messageId, status: "read", timestamp }          (per message, older clients)
 *
 * Socket event (from web / admin clients while a thread is open):
 *   "conversation:read" { conversation_id?, participant_id? }  → ack { success, count }
 */
const toId = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);

export async function markConversationRead(io, conversationId, readerId) {
  const convId = toId(conversationId);
  const reader = toId(readerId);
  if (!convId || !reader) return 0;
  const unread = await Message.find({ conversationId: convId, receiverId: reader, "deliveryStatus.read": false })
    .select("_id senderId")
    .lean();
  if (!unread.length) return 0;
  const readAt = new Date();
  await Message.updateMany(
    { _id: { $in: unread.map((m) => m._id) } },
    { $set: { "deliveryStatus.delivered": true, "deliveryStatus.read": true, "deliveryStatus.readAt": readAt } },
  );
  if (io) {
    const bySender = new Map();
    for (const m of unread) {
      const k = String(m.senderId);
      if (!bySender.has(k)) bySender.set(k, []);
      bySender.get(k).push(String(m._id));
    }
    for (const [senderId, messageIds] of bySender) {
      const room = io.to(`user_${senderId}`);
      room.emit("messages:read", { conversationId: String(convId), readerId: String(reader), messageIds, readAt });
      messageIds.forEach((messageId) => room.emit("message:status", { messageId, status: "read", timestamp: readAt }));
    }
  }
  // The reader's other tabs / devices re-sync their unread badges.
  if (io) io.to(`user_${reader}`).emit("conversation:read:self", { conversationId: String(convId), count: unread.length });
  scheduleSidebarCountsBroadcast();
  return unread.length;
}

async function resolveConversation(readerId, { conversation_id, participant_id }) {
  const reader = toId(readerId);
  if (conversation_id && toId(conversation_id)) {
    const c = await Conversation.findOne({ _id: toId(conversation_id), participants: reader }).select("_id").lean();
    if (c) return c._id;
  }
  if (participant_id && toId(participant_id)) {
    const c = await Conversation.findOne({ participants: { $all: [reader, toId(participant_id)] } })
      .sort({ lastActivity: -1 })
      .select("_id")
      .lean();
    if (c) return c._id;
  }
  return null;
}

export function registerReadHandlers(socket, io) {
  socket.on("conversation:read", async (data = {}, callback) => {
    const cb = typeof callback === "function" ? callback : () => {};
    try {
      const readerId = socket.assignBy || socket.user?._id;
      if (!readerId) return cb({ success: false, error: "Not authenticated" });
      const convId = await resolveConversation(readerId, data);
      if (!convId) return cb({ success: true, count: 0 });
      const count = await markConversationRead(io, convId, readerId);
      cb({ success: true, count, conversationId: String(convId) });
    } catch (e) {
      logger.error(`conversation:read failed: ${e?.message}`);
      cb({ success: false, error: e?.message });
    }
  });
}

/** True when the user has at least one socket connected (their personal room is not empty). */
export const isUserOnline = (io, userId) => Boolean(io && userId && (io.sockets.adapter.rooms.get(`user_${userId}`)?.size || 0) > 0);
