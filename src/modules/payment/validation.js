import Joi from "joi";
import config from "../../config/env.js";

const isTaxApplicable = Boolean(config.get("isTaxApplicable"));

export const createPaymentSchema = Joi.object({
  amount: Joi.number().required(),
  accountId: Joi.string().optional(),
  insurance_protection: Joi.number().optional(),
  cancellation_insurance: Joi.number().optional(),
  address: isTaxApplicable
    ? Joi.object({
        line1: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        zip: Joi.string().optional().allow("", null),
        country: Joi.string().required(),
      }).required()
    : Joi.object({
        line1: Joi.string().optional().allow("", null),
        city: Joi.string().optional().allow("", null),
        state: Joi.string().optional().allow("", null),
        zip: Joi.string().optional().allow("", null),
        country: Joi.string().optional().allow("", null),
      }).optional(),
});

export const verifyAccountSchema = Joi.object({
  accountId: Joi.string().required(),
});
