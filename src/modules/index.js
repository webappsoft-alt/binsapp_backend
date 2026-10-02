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
//Image Uploading

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

    try {
      const image = sharp(file.path, {
        limitInputPixels: false,
        failOn: "truncated",
      });
      const metadata = await image.metadata();

      let sharpPipeline = image.rotate().resize({ width: 800 });

      // Normalize HEIC/HEIF (and other camera formats) to JPEG/PNG for
      // browsers + vision APIs that do not accept iPhone originals.
      if (metadata.hasAlpha) {
        sharpPipeline = sharpPipeline.png({ quality: 80 });
        contentType = "image/png";
        destinationName = `${Date.now()}.png`;
      } else {
        sharpPipeline = sharpPipeline.jpeg({ quality: 80 });
        contentType = "image/jpeg";
        destinationName = `${Date.now()}.jpg`;
      }

      const outPath = join(__dirname, "files", `compressed-${destinationName}`);
      await sharpPipeline.toFile(outPath);
      uploadPath = outPath;
    } catch (imageError) {
      console.warn(
        "sharp image processing failed, trying HEIC fallback:",
        imageError?.message || imageError,
      );

      try {
        const rawBuf = fs.readFileSync(file.path);
        const isHeic =
          ext === "heic" ||
          ext === "heif" ||
          mimeType.includes("heic") ||
          mimeType.includes("heif") ||
          bufferLooksLikeHeic(rawBuf);

        if (isHeic) {
          console.info("upload-image: converting HEIC via heic-convert");
          const jpegBuf = await heicConvert({
            buffer: rawBuf,
            format: "JPEG",
            quality: 0.84,
          });
          const now = Date.now();
          destinationName = `${now}.jpg`;
          contentType = "image/jpeg";
          const heicOutPath = join(
            __dirname,
            "files",
            `heic-converted-${destinationName}`,
          );
          fs.writeFileSync(heicOutPath, Buffer.from(jpegBuf));
          try {
            const image = sharp(heicOutPath, {
              limitInputPixels: false,
              failOn: "truncated",
            });
            const meta = await image.metadata();
            let pipeline = image.rotate().resize({ width: 800 });
            const outPath = join(
              __dirname,
              "files",
              `compressed-${destinationName}`,
            );
            if (meta.hasAlpha) {
              pipeline = pipeline.png({ quality: 80 });
              contentType = "image/png";
              destinationName = `${now}.png`;
            } else {
              pipeline = pipeline.jpeg({ quality: 80 });
              contentType = "image/jpeg";
              destinationName = `${now}.jpg`;
            }
            await pipeline.toFile(outPath);
            uploadPath = outPath;
            fs.unlink(heicOutPath, () => {});
          } catch (secondErr) {
            console.warn(
              "upload-image: heic sharp reprocess failed, uploading converted jpeg directly:",
              secondErr?.message || secondErr,
            );
            uploadPath = heicOutPath;
          }
        } else {
          console.error(
            "Non-HEIC image processing also failed, uploading original file:",
            imageError,
          );
        }
      } catch (heicCatchErr) {
        console.error(
          "HEIC fallback also failed, uploading original:",
          heicCatchErr?.message || heicCatchErr,
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
    // Read the uploaded video file
    const file = req.file;
    const destination = `uploads/${file.filename}`;

    // Upload the compressed video to Firebase Storage
    await bucket.upload(file.path, {
      destination,
      metadata: {
        contentType: file.mimetype, // Adjust content type based on your video format
      },
    });

    // Make the file public
    const fileInBucket = bucket.file(destination);
    await fileInBucket.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    // Delete the original and compressed video files after sending the response
    fs.unlink(file.path, (err) => {
      if (err) console.error("Failed to delete original video:", err);
    });
    res.json({ file: publicUrl });

    // fs.unlink(compressedFilePath, (err) => {
    //   if (err) console.error('Failed to delete compressed video:', err);
    // });
  } catch (error) {
    console.log(error);
    res
      .status(400)
      .json({ message: "Error in uploading. Try again later.", error });
  }
});

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
