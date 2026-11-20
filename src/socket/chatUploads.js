import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import admin from "firebase-admin";
import mime from "mime-types";
import logger from "../config/logger.js";

/**
 * Chunked chat-attachment uploads over the socket, so the sender sees real progress / ETA.
 *
 *   upload:start  { name, size, mimetype }      → ack { success, uploadId, chunkSize }
 *   upload:chunk  { uploadId, offset, data }    → ack { success, received }
 *   upload:end    { uploadId }                  → ack { success, url, filename, mimetype, size }
 *   upload:cancel { uploadId }
 *
 * Bytes go to a temp file, then to Firebase Storage; the message itself only carries the public URL.
 */
const MAX_SIZE = 25 * 1024 * 1024;
const CHUNK_SIZE = 256 * 1024;
const ALLOWED_EXT = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp",
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "odt", "ppt", "pptx", "zip",
  "mp4", "mov", "webm", "mp3", "m4a", "wav", "ogg",
]);

const extOf = (name, mimetype) => {
  const fromName = String(name || "").split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return mime.extension(mimetype || "") || "bin";
};

export function registerChatUploadHandlers(socket) {
  const uploads = new Map();

  const cleanup = (id) => {
    const u = uploads.get(id);
    if (!u) return;
    try {
      u.stream?.destroy();
    } catch {
      /* ignore */
    }
    fs.unlink(u.tmp, () => {});
    uploads.delete(id);
  };

  socket.on("upload:start", (data = {}, cb = () => {}) => {
    try {
      if (!socket.user?._id) return cb({ success: false, error: "Not authenticated" });
      const size = Number(data.size) || 0;
      const ext = extOf(data.name, data.mimetype);
      if (!size || size > MAX_SIZE) return cb({ success: false, error: `Files up to ${MAX_SIZE / 1048576} MB can be sent` });
      if (!ALLOWED_EXT.has(ext)) return cb({ success: false, error: `.${ext} files can't be sent` });
      const uploadId = crypto.randomUUID();
      const tmp = path.join(os.tmpdir(), `chat-${uploadId}.${ext}`);
      uploads.set(uploadId, {
        tmp,
        ext,
        size,
        received: 0,
        name: String(data.name || `file.${ext}`).slice(0, 180),
        mimetype: data.mimetype || mime.lookup(ext) || "application/octet-stream",
        stream: fs.createWriteStream(tmp),
      });
      cb({ success: true, uploadId, chunkSize: CHUNK_SIZE });
    } catch (e) {
      cb({ success: false, error: e.message });
    }
  });

  socket.on("upload:chunk", (data = {}, cb = () => {}) => {
    const u = uploads.get(data.uploadId);
    if (!u) return cb({ success: false, error: "Unknown upload" });
    if (Number(data.offset) !== u.received) return cb({ success: false, error: "Out of order chunk", received: u.received });
    const buf = Buffer.isBuffer(data.data) ? data.data : Buffer.from(data.data || []);
    if (!buf.length || u.received + buf.length > u.size) return cb({ success: false, error: "Bad chunk" });
    u.stream.write(buf, (err) => {
      if (err) return cb({ success: false, error: err.message });
      u.received += buf.length;
      cb({ success: true, received: u.received });
    });
  });

  socket.on("upload:end", (data = {}, cb = () => {}) => {
    const id = data.uploadId;
    const u = uploads.get(id);
    if (!u) return cb({ success: false, error: "Unknown upload" });
    if (u.received !== u.size) return cb({ success: false, error: "Upload incomplete" });
    u.stream.end(async () => {
      try {
        const bucket = admin.storage().bucket();
        const destination = `uploads/chat/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${u.ext}`;
        await bucket.upload(u.tmp, { destination, metadata: { contentType: u.mimetype } });
        await bucket.file(destination).makePublic();
        const url = `https://storage.googleapis.com/${bucket.name}/${destination}`;
        cb({ success: true, url, filename: u.name, mimetype: u.mimetype, size: u.size });
      } catch (e) {
        logger.error(`chat upload failed: ${e?.message}`);
        cb({ success: false, error: "Storage upload failed" });
      } finally {
        cleanup(id);
      }
    });
  });

  socket.on("upload:cancel", (data = {}) => cleanup(data.uploadId));
  socket.on("disconnect", () => [...uploads.keys()].forEach(cleanup));
}
