import Joi from "joi";

export const completeOrderSchema = Joi.object({
  status: Joi.string().required().valid("completed"),
});

export const renteeOrderSchema = Joi.object({
  page: Joi.number().default(1),
  limit: Joi.number().default(10),
  status: Joi.string()
    .valid("all", "pending", "accepted", "completed", "cancelled")
    .default("all"),
  otherId: Joi.string().optional(),
});
