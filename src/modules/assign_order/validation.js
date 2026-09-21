import Joi from "joi";

export const createAssignOrderValidation = Joi.object({
  subUserDetail: Joi.object({
    phone: Joi.string().required(),
    name: Joi.string().optional(),
    email: Joi.string().optional(),
  }).required(),
  orderId: Joi.string().required(),
});

export const updateLocationValidation = Joi.object({
  currentlat: Joi.number().required(),
  currentlng: Joi.number().required(),
});

export const deliveryProofValidation = Joi.object({
  proofOfWorkDone: Joi.array().items(Joi.string().uri()).min(1).required(),
});
