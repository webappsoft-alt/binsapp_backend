import { Schema, model } from "mongoose";

const orderTimelineSchema = new Schema(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    orderDeatil: {
      type: Schema.Types.Mixed,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    // Role-specific timeline copy. `message` stays as the neutral/admin fallback
    // for old entries and non-role events (e.g. webhook writes).
    customerMessage: {
      type: String,
      default: "",
    },
    operatorMessage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);
const OrderTimeline = model("OrderTimeline", orderTimelineSchema);
export default OrderTimeline;
