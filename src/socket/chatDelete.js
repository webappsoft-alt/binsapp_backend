import admin from "firebase-admin";
import Message from "../models/Message.js";
import logger from "../config/logger.js";
import { forgetAttachment } from "../modules/admin/attachments.controller.js";

/**
 * Removing chat files.
 *
 *   message:delete { messageId }  → ack { success }
 *     The sender deletes one of their own file / photo / voice messages. The file is
 *     removed from Firebase Storage and the message becomes "File deleted" for both
 *     people (event "message:deleted" { messageId, conversationId }).
 *
 *   upload:discard { url }  → ack { success }
 *     The sender cancelled after the file had already reached storage but before the
 *     message was sent. Only files this same socket uploaded can be discarded.
 */

/** "uploads/chat/…" path inside our bucket, or null when the URL is not one of our chat files. */
export function chatStoragePath(url) {
  try {
    const bucket = admin.storage().bucket();
    const u = new URL(String(url || ""));
    const prefix = `/${bucket.name}/`;
    if (u.hostname === "storage.googleapis.com" && u.pathname.startsWith(prefix)) {
      const p = decodeURIComponent(u.pathname.slice(prefix.length));
      return p.startsWith("uploads/") ? p : null;
    }
    // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media
    if (u.hostname === "firebasestorage.googleapis.com" && u.pathname.includes(`/b/${bucket.name}/o/`)) {
      const p = decodeURIComponent(u.pathname.split("/o/")[1] || "");
      return p.startsWith("uploads/") ? p : null;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export async function deleteStorageFile(url) {
  const p = chatStoragePath(url);
  if (!p) return false;
  try {
    await admin.storage().bucket().file(p).delete({ ignoreNotFound: true });
    return true;
  } catch (e) {
    logger.warn(`chat file delete failed (${p}): ${e?.message}`);
    return false;
  }
}

export function registerChatDeleteHandlers(socket, io, uploadedUrls) {
  socket.on("message:delete", async (data = {}, cb = () => {}) => {
    if (typeof cb !== "function") cb = () => {};
    logger.info(`message:delete ${data?.messageId} by ${socket.user?._id}`);
    try {
      const me = socket.user?._id ? String(socket.user._id) : null;
      if (!me) return cb({ success: false, error: "Not signed in" });
      const msg = await Message.findById(data.messageId).lean();
      if (!msg) return cb({ success: false, error: "Message not found" });
      if (String(msg.senderId) !== me) return cb({ success: false, error: "You can only delete your own messages" });
      if (msg.isDeleted) return cb({ success: true, messageId: String(msg._id) });

      const url = msg.attachment?.url;
      await Message.updateOne(
        { _id: msg._id },
        { $set: { isDeleted: true, deletedAt: new Date(), content: "" }, $unset: { attachment: 1, thumbnail: 1 } },
        { runValidators: false }
      );
      // Gone from the admin Files page at once.
      if (url) forgetAttachment(url);
      // Storage clean-up can be slow — don't make the sender wait for it.
      if (url) deleteStorageFile(url).catch(() => {});

      const payload = { messageId: String(msg._id), conversationId: String(msg.conversationId) };
      io.to(`user_${msg.senderId}`).emit("message:deleted", payload);
      io.to(`user_${msg.receiverId}`).emit("message:deleted", payload);
      cb({ success: true, ...payload });
    } catch (e) {
      logger.error(`message:delete failed: ${e?.message}`);
      cb({ success: false, error: "Could not delete" });
    }
  });

  socket.on("upload:discard", async (data = {}, cb = () => {}) => {
    const url = String(data.url || "");
    if (!url || !uploadedUrls.has(url)) return cb({ success: false, error: "Unknown file" });
    // Never remove a file that is already part of a sent message.
    const used = await Message.exists({ "attachment.url": url });
    if (used) return cb({ success: false, error: "Already sent" });
    uploadedUrls.delete(url);
    await deleteStorageFile(url);
    cb({ success: true });
  });
}
