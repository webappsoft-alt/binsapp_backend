import mongoose from "mongoose";

const jobEventSchema = new mongoose.Schema({
  operatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    index: true,
  },
  eventType: {
    type: String,
    enum: [
      "NOTIFICATION_RECEIVED",
      "JOB_ACCEPTED",
      "JOB_COMPLETED",
      "JOB_CANCELLED",
      "JOB_REJECTED",
      "JOB_IGNORED",
    ],
    required: true,
  },
  responseTimeMs: {
    type: Number, // milliseconds
    default: null,
  },
  revenueGenerated: {
    type: Number,
    default: 0,
  },
  // For JOB_COMPLETED events: whether the job was completed on/before its end date.
  onTime: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});
const JobEvent = mongoose.model("JobEvent", jobEventSchema);
export default JobEvent;
