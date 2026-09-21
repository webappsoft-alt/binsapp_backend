import Joi from "joi";

const createTemplateSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().required(),
  subject: Joi.string().required(),
});

const updateTemplateSchema = Joi.object({
  title: Joi.string().optional(),
  description: Joi.string().optional(),
  subject: Joi.string().optional(),
});

export { createTemplateSchema, updateTemplateSchema };
