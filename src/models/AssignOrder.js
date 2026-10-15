import { model, Schema } from "mongoose";

const SubUserDeatail = new Schema(
  {
    operator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    phone: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    fcmtoken: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    activeJobsCount: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
    },
    lastInviteSentAt: {
      type: Date,
      default: null,
    },
    inviteSentCount: {
      type: Number,
      default: 0,
    },
    lastInviteLink: {
      type: String,
      default: "",
    },
    isLoggedIn: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
  },
  {
    timestamps: true,
  },
);
const SubUserDetail = model("SubUserDetail", SubUserDeatail);

const AssignOrderSchema = new Schema(
  {
    subUserDetail: {
      type: Schema.Types.ObjectId,
      ref: "SubUserDetail",
      required: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    assignBy: {
      ref: "User",
      type: Schema.Types.ObjectId,
      required: true,
    },
    assignmentType: {
      type: String,
      enum: ["delivery", "pickup", "swap"],
      default: "delivery",
    },
    driverType: {
      type: String,
      enum: ["driver", "self"],
      default: "driver",
    },
    status: {
      type: String,
      enum: [
        "assigned",
        "dispatched",
        "en_route",
        "arrived",
        "delivered",
        "completed",
        "cancel_request",
        "cancelled",
      ],
      default: "assigned",
    },
    timeline: [
      {
        event: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        location: {
          type: { type: String, enum: ["Point"], default: "Point" },
          coordinates: [Number],
        },
        notes: { type: String, default: "" },
        photos: { type: [String], default: [] },
      },
    ],
    requestSentAt: {
      type: Date,
      default: Date.now,
    },
    linkOpened: {
      type: Boolean,
      default: false,
    },
    linkOpenedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);
const AssignOrder = model("AssignOrder", AssignOrderSchema);
export { AssignOrder, SubUserDetail };

