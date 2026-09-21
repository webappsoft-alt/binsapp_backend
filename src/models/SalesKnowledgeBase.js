import { Schema, model } from "mongoose";

const salesKnowledgeBaseSchema = new Schema(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "dumpster_sizing",
        "junk_pricing_rules",
        "provider_terms",
        "policies",
        "commercial",
      ],
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    embedding: {
      type: [Number], // 1536 float dimensions (text-embedding-3-small)
      default: [],
      select: false,  // Hidden from default query projection to save bandwidth
    },
    metadata: {
      targetAudience: {
        type: String,
        enum: ["customer", "provider", "contractor", "all"],
        default: "all",
      },
      active: {
        type: Boolean,
        default: true,
        index: true,
      },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

salesKnowledgeBaseSchema.index({ category: 1, "metadata.active": 1, isDeleted: 1 });
salesKnowledgeBaseSchema.index({ "metadata.targetAudience": 1, "metadata.active": 1, isDeleted: 1 });

const SalesKnowledgeBase = model("SalesKnowledgeBase", salesKnowledgeBaseSchema);
export default SalesKnowledgeBase;
