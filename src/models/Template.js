import { Schema, model } from "mongoose";

/**
 * Admin-managed templates.
 *
 * category  email   → notification / transactional emails
 *           invoice → printable invoice designs
 * kind      custom  → created by an admin in the Templates page
 *           system  → mirrors a template that lives in backend code (see utils/systemTemplates.js).
 *                     While `isCustomized` is false the code version is used; once an admin edits it
 *                     the stored `html` (with {{variables}}) overrides the code version.
 *
 * `description` keeps the raw editor HTML (so CKEditor can reload images, sizes and alignment
 * exactly), `html` keeps the email-ready / rendered version that is actually sent.
 */
const variableSchema = new Schema(
  {
    name: { type: String, required: true },
    label: { type: String, default: "" },
    sample: { type: String, default: "" },
  },
  { _id: false },
);

const templateSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    html: { type: String, default: "" },
    category: {
      type: String,
      enum: ["email", "invoice"],
      default: "email",
      index: true,
    },
    kind: {
      type: String,
      enum: ["custom", "system"],
      default: "custom",
      index: true,
    },
    key: { type: String, default: undefined, trim: true },
    group: { type: String, default: "General" },
    summary: { type: String, default: "" },
    editorMode: { type: String, enum: ["visual", "html"], default: "visual" },
    variables: { type: [variableSchema], default: [] },
    subjectEditable: { type: Boolean, default: true },
    isCustomized: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    accentColor: { type: String, default: "#0EBE3C" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
  },
);

templateSchema.index({ key: 1 }, { unique: true, sparse: true });
templateSchema.index({ title: "text", subject: "text" });

const Template = model("Template", templateSchema);
export default Template;
