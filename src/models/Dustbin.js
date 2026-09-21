import mongoose from "mongoose";
const bookingSchema = new mongoose.Schema({
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
});

const dustbinSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  dumbster: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dumbster",
    // required: true,
    default: null,
  },
  // junkRemoval: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "JunkRemoval",
  //   default: null,
  // },
  // treeRemoval: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "TreeRemoval",
  //   default: null,
  // },
  portaPotty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PortaPotty",
    default: null,
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
  locationObject: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], default: [0, 0] },
    city: { type: String, default: "", index: true },
    country: { type: String, default: "", index: true },
    address: { type: String, default: "" },
  },
  address: String,
  insurancefile: String,
  registrationfile: String,
  issue_date: Date,
  expiry_date: Date,
  insurance_issue_date: Date,
  insurance_expiry_date: Date,
  radius: {
    type: Number,
    default: 40,
  },
  status: {
    type: String,
    default: "active",
    enum: ["active", "deactive"],
  },
  type: {
    type: String,
    default: null,
    enum: ["trailor", "rolloff"],
  },
  verify: {
    type: Boolean,
    default: false,
  },
  rejected: {
    type: Boolean,
    default: false,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 0,
  },
  description: String,
  bookings: {
    type: [bookingSchema],
    default: [],
  }, // Array of bookings with startDate and endDate
  availableQuantity: {
    type: Number,
    default: 1,
  },
  order_extension_price: {
    type: Number,
    default: 20,
  },
  createdAt: { type: Date, default: Date.now, index: true }, // Timestamp for post creation
});

dustbinSchema.index({ location: "2dsphere" });
dustbinSchema.index({ locationObject: "2dsphere" });
// dustbinSchema.index({ "locationObject.city": 1 });
// dustbinSchema.index({ "locationObject.country": 1 });

const Dustbin = mongoose.model("Dustbin", dustbinSchema);
export default Dustbin;
