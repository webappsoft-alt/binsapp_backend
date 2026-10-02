import express from "express";
import authRoutes from "./auth/routes.js";
import userRoutes from "./users/routes.js";
import binRoutes from "./bin/routes.js";
import dumbsterRoutes from "./dumbster/routes.js";
import orderRoutes from "./order/routes.js";
import paymentRoutes from "./payment/routes.js";
import notificationRoutes from "./notification/routes.js";
import ratingRoutes from "./rating/routes.js";
import chatRoutes from "./chat/routes.js";
import adminRoutes from "./admin/routes.js";
import supportRoutes from "./support/routes.js";
import assignOrderRoutes from "./assign_order/routes.js";
import templateRoutes from "./template/routes.js";
import favoriteRoutes from "./favorite/routes.js";
import tierRoutes from "./tier/routes.js";
import companyRoutes from "./company/routes.js";
import leadsRoutes from "./leads/routes.js";
import growthRoutes from "./growth/routes.js";
import publicReviewRoutes from "./public_reviews/routes.js";
import publicSalesAgentRoutes from "./sales_agent/public.routes.js";
import builderOfferRoutes, {
  companyBuilderOfferRouter,
  adminBuilderOfferRouter,
} from "./builderOffer/routes.js";
// image uploading
import admin from "firebase-admin";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { fileURLToPath } from "url";
import mime from "mime-types";
import { dirname, join } from "path";
import multer from "multer";
import fs from "fs";

const bucket = admin.storage().bucket();
import "dotenv";
// Get current directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALLOWED_UPLOAD_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/x-ms-bmp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/tiff",
  "image/tif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
  "audio/m4a",
  "audio/m4b",
  "audio/x-m4a",
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
]);

const ALLOWED_DOC_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "rtf",
  "odt",
]);

const getUploadExtension = (file) => {
  const fromName = String(file?.originalname || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const fromMime = mime.extension(file?.mimetype || "");
  return fromMime || "bin";
};

const isAllowedUploadFile = (file) => {
  const type = String(file?.mimetype || "")
    .toLowerCase()
    .trim();
  if (type && ALLOWED_UPLOAD_MIMES.has(type)) return true;
  // iPhone HEIC / some browsers send empty or octet-stream Content-Type
  if (!type || type === "application/octet-stream") {
    const ext = getUploadExtension(file);
    return (
      ALLOWED_IMAGE_EXTENSIONS.has(ext) || ALLOWED_DOC_EXTENSIONS.has(ext)
    );
  }
  // Also allow known doc extensions even if MIME is slightly off
  const ext = getUploadExtension(file);
  if (ALLOWED_DOC_EXTENSIONS.has(ext) || ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return true;
  }
  return false;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = join(__dirname, "files");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const extension = getUploadExtension(file);
    const filename = `${timestamp}.${extension}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log(file.mimetype, file.originalname);
    if (isAllowedUploadFile(file)) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only images and videos are allowed."),
        false,
      );
    }
  },
});

const handleSingleUpload = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      success: false,
      message: err.message || "File upload failed.",
    });
  });
};
const app = express();

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/bin", binRoutes);
app.use("/dumbster", dumbsterRoutes);
app.use("/order", orderRoutes);
app.use("/payment", paymentRoutes);
app.use("/notification", notificationRoutes);
app.use("/rating", ratingRoutes);
app.use("/conversations", chatRoutes);
// Mount more-specific /admin/* and /company/* routers BEFORE the
// catch-all /admin and /company routers. Those parent routers apply
// `admin` middleware to unmatched paths, which incorrectly 403'd
// company builder-offer creates as "Admin access required".
app.use("/admin/builder-offers", adminBuilderOfferRouter);
app.use("/company/builder-offers", companyBuilderOfferRouter);
app.use("/admin", adminRoutes);
app.use("/support", supportRoutes);
app.use("/assign-order", assignOrderRoutes);
app.use("/assignOrder", assignOrderRoutes);
app.use("/template", templateRoutes);
app.use("/favorite", favoriteRoutes);
app.use("/tier", tierRoutes);
app.use("/company", companyRoutes);
app.use("/builder-offers", builderOfferRoutes);
app.use("/leads", leadsRoutes);
app.use("/growth", growthRoutes);
app.use("/public-reviews", publicReviewRoutes);
app.use("/sales-agent", publicSalesAgentRoutes);
// Image Uploading & HEIC Conversion
const HEIC_FTYP_BRANDS = new Set([
  "heic",
  "heif",
  "mif1",
  "msf1",
  "heix",
  "hevc",
]);

function bufferLooksLikeHeic(buf) {
  if (!buf || buf.length < 12) return false;
  const ftyp = buf.toString("ascii", 4, 8);
  if (ftyp !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12).toLowerCase();
  return HEIC_FTYP_BRANDS.has(brand);
}

function isHeicUpload(file, buffer) {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  const ext = getUploadExtension(file);
  return (
    ext === "heic" ||
    ext === "heif" ||
    mimeType.includes("heic") ||
    mimeType.includes("heif") ||
    (buffer && bufferLooksLikeHeic(buffer))
  );
}

async function normalizeHeicToJpegBuffer(buffer, quality = 0.85) {
  if (!buffer || buffer.length === 0) return null;

  // 1. If it has real HEIC magic bytes in its header
  if (bufferLooksLikeHeic(buffer)) {
    try {
      const jpegBuf = await heicConvert({
        buffer,
        format: "JPEG",
        quality,
      });
      return Buffer.from(jpegBuf);
    } catch (heicErr) {
      console.warn("heicConvert failed on real HEIC header:", heicErr?.message);
    }
  }

  // 2. If it's another image format (like JPEG, PNG, WebP) disguised with a .heic extension
  try {
    const img = sharp(buffer, { limitInputPixels: false, failOn: "none" });
    const meta = await img.metadata();
    if (meta.format) {
      return await img.jpeg({ quality: Math.round(quality * 100) }).toBuffer();
    }
  } catch (sharpErr) {
    // Sharp couldn't decode, try heicConvert as last resort
    try {
      const jpegBuf = await heicConvert({
        buffer,
        format: "JPEG",
        quality,
      });
      return Buffer.from(jpegBuf);
    } catch {
      return null;
    }
  }
  return null;
}

const handleImageUpload = async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const file = req.file;
  const mimeType = String(file.mimetype || "").toLowerCase();
  const ext = getUploadExtension(file);
  const looksLikeImage =
    mimeType.startsWith("image/") || ALLOWED_IMAGE_EXTENSIONS.has(ext);

  if (!looksLikeImage) {
    return res.status(400).send("Only image files are allowed.");
  }

  try {
    let uploadPath = file.path;
    let contentType = mimeType.startsWith("image/")
      ? mimeType
      : `image/${ext === "jpg" ? "jpeg" : ext}`;
    let destinationName = file.filename;

    let rawBuf = null;
    try {
      rawBuf = fs.readFileSync(file.path);
    } catch (readErr) {
      console.warn("Failed to read raw file buffer:", readErr?.message);
    }

    const isHeic = isHeicUpload(file, rawBuf);

    if (isHeic && rawBuf) {
      try {
        console.info("upload-image: converting HEIC to JPEG");
        const jpegBuf = await normalizeHeicToJpegBuffer(rawBuf, 0.85);
        if (jpegBuf) {
          const now = Date.now();
          destinationName = `${now}.jpg`;
          contentType = "image/jpeg";
          const heicOutPath = join(
            __dirname,
            "files",
            `heic-converted-${destinationName}`,
          );
          fs.writeFileSync(heicOutPath, jpegBuf);
          uploadPath = heicOutPath;

          // Try sharp resize/compression on converted JPEG
          try {
            const image = sharp(heicOutPath, {
              limitInputPixels: false,
              failOn: "truncated",
            });
            const outPath = join(
              __dirname,
              "files",
              `compressed-${destinationName}`,
            );
            await image
              .rotate()
              .resize({ width: 800 })
              .jpeg({ quality: 80 })
              .toFile(outPath);
            uploadPath = outPath;
            fs.unlink(heicOutPath, () => {});
          } catch (sharpErr) {
            console.warn(
              "upload-image: sharp resize on converted HEIC failed, using direct jpeg:",
              sharpErr?.message,
            );
          }
        }
      } catch (heicErr) {
        console.error(
          "upload-image: HEIC conversion failed, uploading original:",
          heicErr?.message || heicErr,
        );
      }
    } else {
      // Normal image: resize/compress via sharp
      try {
        const image = sharp(file.path, {
          limitInputPixels: false,
          failOn: "truncated",
        });
        const metadata = await image.metadata();

        let sharpPipeline = image.rotate().resize({ width: 800 });

        if (metadata.hasAlpha) {
          sharpPipeline = sharpPipeline.png({ quality: 80 });
          contentType = "image/png";
          destinationName = `${Date.now()}.png`;
        } else {
          sharpPipeline = sharpPipeline.jpeg({ quality: 80 });
          contentType = "image/jpeg";
          destinationName = `${Date.now()}.jpg`;
        }

        const outPath = join(
          __dirname,
          "files",
          `compressed-${destinationName}`,
        );
        await sharpPipeline.toFile(outPath);
        uploadPath = outPath;
      } catch (imageError) {
        console.warn(
          "sharp image processing failed, uploading original file:",
          imageError?.message || imageError,
        );
      }
    }

    const destination = `uploads/${destinationName}`;

    await bucket.upload(uploadPath, {
      destination,
      metadata: {
        contentType,
      },
    });

    const fileInBucket = bucket.file(destination);
    await fileInBucket.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    fs.unlink(file.path, () => {});
    if (uploadPath !== file.path) fs.unlink(uploadPath, () => {});

    res.json({ image: publicUrl });
  } catch (error) {
    console.log(error);
    res
      .status(400)
      .json({ message: "Error in uploading. Try again later.", error });
  }
};
app.post("/upload-image", handleSingleUpload("image"), handleImageUpload);
app.post("/image/upload", handleSingleUpload("image"), handleImageUpload);
app.post("/upload-file", handleSingleUpload("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  try {
    const file = req.file;
    let uploadPath = file.path;
    let contentType = file.mimetype || "application/octet-stream";
    let destinationName = file.filename;

    let rawBuf = null;
    try {
      rawBuf = fs.readFileSync(file.path);
    } catch (readErr) {
      console.warn("upload-file: failed to read buffer:", readErr?.message);
    }

    const isHeic = isHeicUpload(file, rawBuf);

    if (isHeic && rawBuf) {
      try {
        console.info("upload-file: converting HEIC to JPEG");
        const jpegBuf = await normalizeHeicToJpegBuffer(rawBuf, 0.85);
        if (jpegBuf) {
          const now = Date.now();
          destinationName = `${now}.jpg`;
          contentType = "image/jpeg";
          const convertedPath = join(
            __dirname,
            "files",
            `converted-${destinationName}`,
          );
          fs.writeFileSync(convertedPath, jpegBuf);
          uploadPath = convertedPath;
        }
      } catch (convErr) {
        console.warn(
          "upload-file: HEIC conversion failed, uploading original:",
          convErr?.message || convErr,
        );
      }
    }

    const destination = `uploads/${destinationName}`;

    await bucket.upload(uploadPath, {
      destination,
      metadata: {
        contentType,
      },
    });

    const fileInBucket = bucket.file(destination);
    await fileInBucket.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    fs.unlink(file.path, () => {});
    if (uploadPath !== file.path) fs.unlink(uploadPath, () => {});

    res.json({ file: publicUrl });
  } catch (error) {
    console.log(error);
    res
      .status(400)
      .json({ message: "Error in uploading. Try again later.", error });
  }
});

function extractGcsObjectPath(rawUrl) {
  try {
    const u = new URL(rawUrl);

    // https://storage.googleapis.com/{bucket}/{object}
    if (u.hostname === "storage.googleapis.com") {
      const parts = u.pathname.replace(/^\//, "").split("/");
      const bucketName = parts.shift();
      if (!bucketName || bucketName !== bucket.name) return null;
      return decodeURIComponent(parts.join("/"));
    }

    // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedObject}
    if (u.hostname === "firebasestorage.googleapis.com") {
      const match = u.pathname.match(/\/v0\/b\/([^/]+)\/o\/(.+)/);
      if (!match) return null;
      if (match[1] !== bucket.name) return null;
      return decodeURIComponent(match[2]);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Proxy + normalize document images for admin preview.
 * HEIC/HEIF (and other camera formats browsers can't render) → JPEG via sharp.
 * GET /api/preview-file?url=<encoded GCS url>
 */
app.get("/preview-file", async (req, res) => {
  try {
    const rawUrl = String(req.query.url || "").trim();
    if (!rawUrl) {
      return res.status(400).json({ message: "url query param is required" });
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ message: "Invalid url" });
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(400).json({ message: "Invalid protocol" });
    }

    const objectPath = extractGcsObjectPath(rawUrl);
    let buffer;
    let contentTypeHint = "";

    if (objectPath) {
      const gcsFile = bucket.file(objectPath);
      const [meta] = await gcsFile.getMetadata().catch(() => [null]);
      contentTypeHint = String(meta?.contentType || "").toLowerCase();
      const [downloaded] = await gcsFile.download();
      buffer = downloaded;
    } else {
      // Fallback HTTP fetch for odd but still-allowed host shapes
      const upstream = await fetch(rawUrl);
      if (!upstream.ok) {
        return res
          .status(upstream.status)
          .json({ message: `Upstream fetch failed (${upstream.status})` });
      }
      contentTypeHint = String(
        upstream.headers.get("content-type") || "",
      ).toLowerCase();
      buffer = Buffer.from(await upstream.arrayBuffer());
    }

    const pathLower = parsed.pathname.toLowerCase();
    const isHeic =
      /\.(heic|heif)$/i.test(pathLower) ||
      contentTypeHint.includes("heic") ||
      contentTypeHint.includes("heif") ||
      bufferLooksLikeHeic(buffer);

    const isPdf =
      pathLower.endsWith(".pdf") || contentTypeHint.includes("application/pdf");

    if (isPdf) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.send(buffer);
    }

    // HEIC/HEIF: sharp often lacks HEVC decode; heic-convert (libheif-js) handles it
    if (isHeic) {
      try {
        const jpegBuf = await heicConvert({
          buffer,
          format: "JPEG",
          quality: 0.9,
        });
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=300");
        res.setHeader("X-Preview-Converted", "heic-convert");
        return res.send(Buffer.from(jpegBuf));
      } catch (heicErr) {
        console.warn("preview-file heic-convert failed:", heicErr?.message);
      }
    }

    if (isHeic || contentTypeHint.startsWith("image/") || !contentTypeHint) {
      try {
        const image = sharp(buffer, {
          limitInputPixels: false,
          failOn: "truncated",
        });
        const metadata = await image.metadata();
        let pipeline = image.rotate();
        let outType = "image/jpeg";
        let outBuf;

        if (metadata.hasAlpha) {
          outBuf = await pipeline.png({ quality: 90 }).toBuffer();
          outType = "image/png";
        } else {
          outBuf = await pipeline.jpeg({ quality: 90 }).toBuffer();
          outType = "image/jpeg";
        }

        res.setHeader("Content-Type", outType);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.setHeader("X-Preview-Converted", isHeic ? "heic-sharp" : "image");
        return res.send(outBuf);
      } catch (convErr) {
        console.warn("preview-file sharp convert failed:", convErr?.message);
      }
    }

    // Do not return raw HEIC — browsers cannot display it
    if (isHeic) {
      return res.status(422).json({
        message:
          "HEIC could not be converted for preview. Download the file instead.",
      });
    }

    res.setHeader(
      "Content-Type",
      contentTypeHint || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(buffer);
  } catch (error) {
    console.error("preview-file error:", error);
    return res.status(500).json({
      message: "Failed to load preview file",
      error: error?.message,
    });
  }
});

export default app;
