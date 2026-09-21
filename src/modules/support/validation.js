import Joi from "joi";

export const createSupportSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  msg: Joi.string().required(),
});
