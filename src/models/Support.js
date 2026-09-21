import mongoose from "mongoose";
const supportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  name: {
    type: String,
    required: true,
  },
  supportId: String,
  email: {
    type: String,
    required: true,
  },
  msg: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updated_at: {
    type: Date,
    default: Date.now,
    index: true,
  },
  history: Array,
  attended: {
    type: Boolean,
    default: false,
  },
  isAdminSeen: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.model("Support", supportSchema);
