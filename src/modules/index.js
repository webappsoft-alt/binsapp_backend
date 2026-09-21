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

app.post("/upload-image", handleSingleUpload("image"), async (req, res) => {
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
      console.error(
        "Image processing failed, uploading original file:",
        imageError,
      );
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
});
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
export default app;
