import mongoose from "mongoose";
const AdminManualReviewRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    start_date: Date,
    end_date: Date,
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    time: [String],
    images: [String],
    address: String,
    service_type: {
      type: String,
      enum: ["Junk Removal", "Tree Removal"],
      default: "Tree Removal",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "accepted", "cancelled", "deleted"],
    },
    RealOrderNumber: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    userAcceptedStatus: {
      type: String,
      default: "pending",
      enum: ["pending", "accepted", "cancelled"],
    },
    notesByAdmin: {
      type: String,
      default: "",
    },
    finalPricing: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

const AdminManualReviewRequest = mongoose.model(
  "AdminManualReviewRequest",
  AdminManualReviewRequestSchema,
);
export default AdminManualReviewRequest;
