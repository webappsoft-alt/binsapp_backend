import Joi from "joi";

export const createBin = Joi.object({
  dumbster: Joi.string().optional().allow("").allow(null),
  junkRemoval: Joi.string().optional().allow("").allow(null),
  treeRemoval: Joi.string().optional().allow("").allow(null),
  portaPotty: Joi.string().optional().allow("").allow(null),
  location: Joi.object({
    type: Joi.string().valid("Point").required(),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).required(),
  address: Joi.string().required(),
  insurancefile: Joi.string().optional().allow("").allow(null),
  registrationfile: Joi.string().optional().allow("").allow(null),
  issue_date: Joi.date().optional().allow("").allow(null),
  expiry_date: Joi.date().optional().allow("").allow(null),
  insurance_issue_date: Joi.date().optional().allow("").allow(null),
  insurance_expiry_date: Joi.date().optional().allow("").allow(null),
  type: Joi.string().optional().valid("trailor", "rolloff").default(null),
  quantity: Joi.number().required(),
  description: Joi.string().optional().allow("").allow(null),
  userId: Joi.string().optional().allow("").allow(null),
  radius: Joi.number().optional().allow("").allow(null),
  locationObject: Joi.object({
    type: Joi.string().valid("Point").required(),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
    city: Joi.string().required(),
    country: Joi.string().required(),
    address: Joi.string().required(),
  }).required(),
  order_extension_price: Joi.number().optional().allow("").allow(null),
});

export const updateBin = Joi.object({
  junkRemoval: Joi.string().optional().allow("").allow(null),
  treeRemoval: Joi.string().optional().allow("").allow(null),
  portaPotty: Joi.string().optional().allow("").allow(null),
  dumbster: Joi.string().optional().allow("").allow(null),
  location: Joi.object({
    type: Joi.string().valid("Point").optional(),
    coordinates: Joi.array().items(Joi.number()).length(2).optional(),
  }).optional(),
  address: Joi.string().optional().allow("").allow(null),
  insurancefile: Joi.string().optional().allow("").allow(null),
  registrationfile: Joi.string().optional().allow("").allow(null),
  issue_date: Joi.date().optional().allow("").allow(null),
  expiry_date: Joi.date().optional().allow("").allow(null),
  insurance_issue_date: Joi.date().optional().allow("").allow(null),
  insurance_expiry_date: Joi.date().optional().allow("").allow(null),
  type: Joi.string()
    .optional()
    .valid("trailor", "rolloff")
    .allow("")
    .allow(null),
  quantity: Joi.number().optional().allow("").allow(null),
  userId: Joi.string().optional().allow("").allow(null),
  radius: Joi.number().optional().allow("").allow(null),
  locationObject: Joi.object({
    type: Joi.string().valid("Point").optional(),
    coordinates: Joi.array().items(Joi.number()).length(2).optional(),
    city: Joi.string().optional(),
    country: Joi.string().optional(),
    address: Joi.string().optional(),
  }).optional(),
  order_extension_price: Joi.number().optional().allow("").allow(null),
})
  .or("dumbster", "junkRemoval", "treeRemoval", "portaPotty")
  .xor("dumbster", "junkRemoval", "treeRemoval", "portaPotty")
  .messages({
    "object.xor":
      "Please provide exactly one service type (Dumbster, Junk, Tree, or Porta Potty).",
    "object.missing": "One of the service types is required.",
  });
