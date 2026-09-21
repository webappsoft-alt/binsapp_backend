import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    to_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    dumbster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dumbster",
    },
    junkRemoval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JunkRemoval",
    },
    treeRemoval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TreeRemoval",
    },
    portaPotty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PortaPotty",
    },
    images: {
      type: [String],
      default: [],
    },
    service_type: {
      type: String,
      enum: ["Dumbster", "Junk Removal", "Tree Removal", "Porta Potty"],
      default: "Dumbster",
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    dustbin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dustbin",
    },
    start_date: Date,
    end_date: Date,
    num_days: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      default: 0,
    },
    amount: {
      type: Number,
      default: 0,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    category: {
      type: String,
      default: "",
    },
    subCategory: {
      type: String,
      default: "",
    },
    address: String,
    paymentId: String,
    payment_type: {
      type: String,
      enum: ["stripe", "wallet", "invoice", "card"],
      default: "stripe",
    },
    driveaway: {
      type: Boolean,
      default: false,
    },
    cancelation: {
      type: Boolean,
      default: false,
    },
    cancelation_request: {
      type: Boolean,
      default: false,
    },
    transferId: String,
    dropoffimage: String,
    transfer: {
      type: Boolean,
      default: false,
    },
    onway: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "accepted", "completed", "cancelled"],
    },
    proofOfWorkStatus: {
      type: String,
      enum: ["accepted", "rejected"],
    },
    refunded: {
      type: Boolean,
      default: false,
    },
    userIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    rentee_rating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rating",
    },
    renter_rating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rating",
    },
    renteeRate: {
      type: Boolean,
      default: false,
    },
    renterRate: {
      type: Boolean,
      default: false,
    },
    rejected_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    accepted_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    materialInformation: String,
    insurance: String,
    image: String,
    time: [String],
    assignOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssignOrder",
      default: null,
    },
    readyToPickup: {
      type: Boolean,
      default: false,
    },
    extra: {
      type: Number,
      default: 0,
    },
    total_price: {
      type: Number,
      default: 0,
    },
    placementLocation: {
      type: String,
    },
    placementNote: {
      type: String,
    },
    placementPhotos: {
      type: [String],
      default: [],
    },
    drivewaySurfaceType: {
      type: String,
      enum: ["concrete", "asphalt", "gravel", "dirt", "grass", "other", ""],
      default: "",
    },
    gateAccessCode: {
      type: String,
      default: "",
    },
    accessInstructions: {
      type: String,
      default: "",
    },
    obstaclesNotes: {
      type: String,
      default: "",
    },
    contactPreference: {
      type: String,
      enum: ["call", "text", "none", "", "call_on_arrival"],
      default: "",
    },
    specialInstructions: {
      type: String,
      default: "",
    },
    deliveryWorkflow: {
      assignedDriver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubUserDetail",
        default: null,
      },
      assignedDriverType: {
        type: String,
        enum: ["driver", "self"],
        default: "driver",
      },
      assignedDriverName: {
        type: String,
        default: "",
      },
      assignedDriverPhone: {
        type: String,
        default: "",
      },
      assignedAt: {
        type: Date,
        default: null,
      },
      dispatchedAt: {
        type: Date,
        default: null,
      },
      enRouteAt: {
        type: Date,
        default: null,
      },
      arrivedAt: {
        type: Date,
        default: null,
      },
      arrivalLocation: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number],
        },
      },
      deliveryPhotos: {
        type: [String],
        default: [],
      },
      deliveryNotes: {
        type: String,
        default: "",
      },
      unitNumber: {
        type: String,
        default: "",
      },
      deliveredAt: {
        type: Date,
        default: null,
      },
      status: {
        type: String,
        enum: [
          "unassigned",
          "assigned",
          "dispatched",
          "en_route",
          "arrived",
          "delivered",
          "completed",
        ],
        default: "unassigned",
      },
    },
    pickupWorkflow: {
      assignedDriver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubUserDetail",
        default: null,
      },
      assignedDriverType: {
        type: String,
        enum: ["driver", "self"],
        default: "driver",
      },
      assignedDriverName: {
        type: String,
        default: "",
      },
      assignedDriverPhone: {
        type: String,
        default: "",
      },
      requestedAt: {
        type: Date,
        default: null,
      },
      assignedAt: {
        type: Date,
        default: null,
      },
      dispatchedAt: {
        type: Date,
        default: null,
      },
      enRouteAt: {
        type: Date,
        default: null,
      },
      arrivedAt: {
        type: Date,
        default: null,
      },
      arrivalLocation: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number],
        },
      },
      beforePickupPhotos: {
        type: [String],
        default: [],
      },
      afterPickupPhotos: {
        type: [String],
        default: [],
      },
      issues: [
        {
          issueType: { type: String, default: "" },
          notes: { type: String, default: "" },
          photos: { type: [String], default: [] },
          reportedAt: { type: Date, default: Date.now },
        },
      ],
      pickupNotes: {
        type: String,
        default: "",
      },
      pickedUpAt: {
        type: Date,
        default: null,
      },
      status: {
        type: String,
        enum: [
          "none",
          "ready",
          "assigned",
          "dispatched",
          "en_route",
          "arrived",
          "picked_up",
          "completed",
        ],
        default: "none",
      },
    },
    swapWorkflow: {
      existingUnitPhotos: {
        type: [String],
        default: [],
      },
      replacementUnitNumber: {
        type: String,
        default: "",
      },
      replacementPhotos: {
        type: [String],
        default: [],
      },
      swapNotes: {
        type: String,
        default: "",
      },
      completedAt: {
        type: Date,
        default: null,
      },
    },
    orderNumber: {
      type: String,
    },
    quantity: {
      type: Number,
      default: 1,
    },
    isAdminSeen: {
      type: Boolean,
      default: false,
    },
    proofOfWorkDone: {
      type: [String],
      default: [],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    extended_days: {
      type: Number,
      default: 0,
    },
    extended_price: {
      type: Number,
      default: 0,
    },
    new_end_date: {
      type: Date,
      default: null,
    },
    extended_paymentId: {
      type: String,
      default: null,
    },
    reason: {
      type: String,
      default: "",
    },

    // --- Commercial / builder portal (only set when `company` is present) ---
    jobSite: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSites",
      default: null,
    },
    commercialSize: {
      // Dumpster yards + porta/junk/tree commercial unit keys (builder offers).
      type: String,
      enum: [
        "10",
        "15",
        "20",
        "30",
        "40",
        "standard",
        "ada",
        "flushable",
        "sink_station",
        "handwash",
        "truck_load",
        "half_load",
        "full_load",
        "custom",
        "removal",
        "trimming",
        "stump",
        "debris_haul",
      ],
      default: undefined,
    },
    includedTons: { type: Number, default: null },
    overagePerTon: { type: Number, default: null },
    overageEnforced: { type: Boolean, default: false },
    actualWeight: { type: Number, default: null },
    weightRecordedAt: { type: Date, default: null },
    weightRecordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    overageTons: { type: Number, default: 0 },
    overageAmount: { type: Number, default: 0 },
    overageStatus: {
      type: String,
      enum: ["none", "may_apply", "billed", "waived"],
      default: "none",
    },
    reAssign: {
      type: Boolean,
      default: false,
    },
    companyPaymentMethod: {
      type: String,
      enum: ["card", "invoice"],
      default: undefined,
    },
    billingRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingRecord",
      default: null,
    },
    perDiemRateSnapshot: { type: Number, default: null },
    // Swap linkage: pickup order <-> new drop-off order
    swapRequest: {
      status: {
        type: String,
        enum: [
          "none",
          "requested",
          "accepted",
          "dispatched",
          "completed",
          "cancelled",
        ],
        default: "none",
      },
      requestedSize: {
        type: String,
        enum: ["10", "15", "20", "30", "40"],
        default: undefined,
      },
      sameSize: { type: Boolean, default: true },
      windowStart: { type: Date, default: null },
      windowEnd: { type: Date, default: null },
      linkedPickupOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null,
      },
      linkedDropoffOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null,
      },
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      requestedAt: { type: Date, default: null },
      notes: { type: String, default: "" },
    },
    orderKind: {
      type: String,
      enum: ["standard", "swap_pickup", "swap_dropoff"],
      default: "standard",
    },
    builderOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BuilderOffer",
      default: null,
      index: true,
    },
    builderOfferAllocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BuilderOfferAllocation",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.index({ location: "2dsphere" });

export default mongoose.model("Order", orderSchema);
