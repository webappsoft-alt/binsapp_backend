import Joi from "joi";

export const createPublicReviewValidation = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  rating: Joi.number().required(),
  title: Joi.string().required(),
  review: Joi.string().required(),
});

export const getAllPublicReviewsValidation = Joi.object({
  page: Joi.number().optional(),
  limit: Joi.number().optional(),
  isDeleted: Joi.boolean().optional(),
  search: Joi.string().optional(),
});

export const deletePublicReviewValidation = Joi.object({
  id: Joi.string().required(),
});

export const getAllPublicReviewsForWebsiteValidation = Joi.object({
  page: Joi.number().optional(),
  limit: Joi.number().optional(),
});
