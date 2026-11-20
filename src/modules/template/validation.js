import Joi from "joi";

const variable = Joi.object({
  name: Joi.string().required(),
  label: Joi.string().allow("").optional(),
  sample: Joi.string().allow("").optional(),
});

const common = {
  description: Joi.string().allow(""),
  html: Joi.string().allow(""),
  subject: Joi.string().allow(""),
  group: Joi.string().allow(""),
  summary: Joi.string().allow(""),
  editorMode: Joi.string().valid("visual", "html"),
  variables: Joi.array().items(variable),
  isActive: Joi.boolean(),
  isDefault: Joi.boolean(),
  accentColor: Joi.string().allow(""),
};

const createTemplateSchema = Joi.object({
  ...common,
  title: Joi.string().required(),
  category: Joi.string().valid("email", "invoice").default("email"),
}).or("description", "html");

const updateTemplateSchema = Joi.object({
  ...common,
  title: Joi.string(),
});

export { createTemplateSchema, updateTemplateSchema };
