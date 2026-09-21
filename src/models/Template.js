import { Schema, model } from "mongoose";

const templateSchema = new Schema(
  {
    title: String,
    description: String,
    subject: String,
  },
  {
    timestamps: true,
  },
);
const Template = model("Template", templateSchema);
export default Template;
