import { Schema, model } from "mongoose";

const publicReviewSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    rating: { type: Number, required: true },
    title: { type: String, required: true },
    review: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

const PublicReviews = model("PublicReviews", publicReviewSchema);
export default PublicReviews;
