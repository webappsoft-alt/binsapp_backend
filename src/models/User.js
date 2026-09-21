import jwt from "jsonwebtoken";
import config from "config";
import Joi from "joi";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      minlength: 0,
      maxlength: 1024,
    },
    comp_name: {
      type: String,
      minlength: 0,
      maxlength: 1024,
    },
    email: {
      type: String,
      minlength: 5,
      maxlength: 255,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      minlength: 5,
      maxlength: 255,
      unique: true,
    },
    code: {
      type: Number,
      minlength: 0,
      maxlength: 4,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
      },
    },
    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
      },
    },
    binsCount: {
      type: Number,
      default: 0,
    },
    lat: Number,
    lng: Number,
    currentlat: Number,
    currentlng: Number,
    profilePicture: String,
    cus_id: { type: String, default: null, index: true },
    accountId: { type: String, default: null, index: true },
    pendingCount: {
      type: Number,
      default: 0,
    },
    delete_request: {
      type: Boolean,
      default: false,
    },
    verifyCount: {
      type: Number,
      default: 0,
    },
    rejectCount: {
      type: Number,
      default: 0,
    },
    PortaPottypendingCount: {
      type: Number,
      default: 0,
    },
    PortaPottyverifyCount: {
      type: Number,
      default: 0,
    },
    PortaPottyrejectCount: {
      type: Number,
      default: 0,
    },
    accountId_verified: {
      type: Boolean,
      default: false,
    },
    address: String,
    driving_license: String,
    total_reviews: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: "online",
      enum: ["online", "offline", "deleted", "deactivated"],
    },
    role: {
      type: String,
      default: "temp",
      enum: ["temp", "rentee", "renter", "admin"],
    },
    access_types: {
      type: String,
      enum: ["portaPotty", "treeRemoval", "junkRemoval", "company"],
      default: null,
    },
    type: {
      type: String,
    },
    balance: {
      type: Number,
      default: 0,
    },
    ordersDetails: {
      completed: {
        type: Number,
        default: 0,
      },
      accepted: {
        type: Number,
        default: 0,
      },
      cancelled: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        default: 0,
      },
    },
    fcmtoken: String,
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    chatUpdatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    radius: {
      type: Number,
      default: 40,
    },
    isBranded: {
      type: Boolean,
      default: false,
    },
    operatorStats: {
      score: { type: Number, default: 0 },
      tier: { type: Number, default: 1 },
      tier_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tier",
        default: null,
      },
      totalJobs: { type: Number, default: 0 },
      acceptedJobs: { type: Number, default: 0 },
      cancelledJobs: { type: Number, default: 0 },
      onTimeDeliveries: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      lastActive: { type: Date, default: Date.now },
      // Computed percentages for the Operator Score screen
      acceptanceRate: { type: Number, default: 0 },
      cancellationRate: { type: Number, default: 0 },
      onTimeRate: { type: Number, default: 0 },
      completionRate: { type: Number, default: 0 },
      responseRate: { type: Number, default: 0 }, // % of notifications responded to
      avgResponseTime: { type: Number, default: 0 }, // in minutes
      totalRevenue: { type: Number, default: 0 },
    },
    binsCredit: {
      total: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
      used: { type: Number, default: 0 },
    },
    compnay_status: {
      type: String,
      default: null,
      enum: ["pending", "approved", "rejected"],
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    legal_business_name: {
      type: String,
      default: "",
    },
    EIN: {
      type: String,
      default: "",
    },
    same_day_availability: {
      type: Boolean,
      default: false,
    },
    junkRemoval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JunkRemoval",
      default: null,
    },
    treeRemoval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TreeRemoval",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ location: "2dsphere" });
userSchema.index({ currentLocation: "2dsphere" });

userSchema.pre("save", function () {
  // Ensure location and currentLocation formatting
  if (!this.location) {
    this.location = { type: "Point", coordinates: [0, 0] };
  }
  if (!Array.isArray(this.location.coordinates)) {
    this.location.coordinates = [0, 0];
  }
  if (this.lat !== undefined || this.lng !== undefined) {
    this.location.coordinates[1] = Number(this.lat) || 0;
    this.location.coordinates[0] = Number(this.lng) || 0;
  }

  if (this.currentlat !== undefined || this.currentlng !== undefined) {
    if (!this.currentLocation) {
      this.currentLocation = { type: "Point", coordinates: [0, 0] };
    }
    if (!Array.isArray(this.currentLocation.coordinates)) {
      this.currentLocation.coordinates = [0, 0];
    }
    this.currentLocation.coordinates[1] = Number(this.currentlat) || 0;
    this.currentLocation.coordinates[0] = Number(this.currentlng) || 0;
  }
});

function generateAuthToken(_id, type) {
  const token = jwt.sign({ _id: _id, type: type }, config.get("jwtPrivateKey"));
  return token;
}
function generateAdminAuthToken(_id, type) {
  const expiresIn = 7 * 24 * 3600; // Token will expire in 1 hour (3600 seconds)
  const token = jwt.sign(
    { _id: _id, type: type },
    config.get("jwtPrivateKey"),
    { expiresIn },
  );
  return token;
}
function generateIdToken(_id) {
  const expiresIn = 3600; // Token will expire in 1 hour (3600 seconds)
  const token = jwt.sign({ _id: _id }, config.get("jwtIDPrivateKey"), {
    expiresIn,
  });
  return token;
}

// IMPORTANT: Always register with the CURRENT schema to ensure all fields (including radius) are present.
// mongoose.deleteModel() is the official way to fully clean up stale model registrations.
try {
  mongoose.deleteModel("User");
} catch (e) {
  // Model doesn't exist yet — that's fine
}
const User = mongoose.model("User", userSchema);

function validateUser(user) {
  const commonSchema = {
    name: Joi.string().min(2).max(50).required(),
    phone: Joi.string().min(2).max(50).required(),
    password: Joi.string().min(5).max(255).required(),
    email: Joi.string().min(5).max(255).email(),
    fcmtoken: Joi.string().min(0).max(1024).optional(),
    profilePicture: Joi.string().min(0).max(1024).optional(),
    speciality: Joi.string().min(0).max(1024).optional(),
    description: Joi.string().min(0).max(1024).optional(),
    license: Joi.string().min(0).max(1024).optional(),
    balance: Joi.number().min(0).optional(),
    docs: Joi.array().optional(),
    radius: Joi.number().min(0).optional(),
    lat: Joi.number().optional(),
    lng: Joi.number().optional(),
    currentlat: Joi.number().optional(),
    currentlng: Joi.number().optional(),
  };

  const schema = Joi.object({
    ...commonSchema,
  });

  return schema.validate(user);
}
function passwordApiBodyValidate(body) {
  const schema = Joi.object({
    password: Joi.string().min(5).max(255).required(),
    token: Joi.string().min(5).max(255).required(),
  });

  return schema.validate(body);
}

function phoneApiBodyValidate(body) {
  const schema = Joi.object({
    phone: Joi.string().min(4).max(50).required(),
  });

  return schema.validate(body);
}

function validateCodeUser(user) {
  const schema = Joi.alternatives().try(
    Joi.object({
      email: Joi.string().min(5).max(255).required().email(),
    }),
    Joi.object({
      phone: Joi.string().min(5).max(255).required(),
    }),
  );

  return schema.validate(user);
}

export default User;

export {
  User,
  validateUser as validate,
  generateAuthToken,
  generateIdToken,
  generateAdminAuthToken,
  passwordApiBodyValidate,
  validateCodeUser,
  phoneApiBodyValidate,
};
