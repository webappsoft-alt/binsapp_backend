import Joi from "joi";

export const createTierValidation = Joi.object({
  title: Joi.string().required(),
  level: Joi.number().integer().min(1).max(10).required(),
  benefits: Joi.array().items(Joi.string()).optional(),
  minimumPerformanceFactorsValue: Joi.object({
    completedJobs: Joi.number().required(),
    acceptanceRate: Joi.number().required(),
    onTimeDelivery: Joi.number().required(),
    rating: Joi.number().required(),
    cancellationRate: Joi.number().required(),
    responseRate: Joi.number().required(),
    totalRevenue: Joi.number().required(),
  }).required(),
  maximumPerformanceFactorsValue: Joi.object({
    completedJobs: Joi.number().required(),
    acceptanceRate: Joi.number().required(),
    onTimeDelivery: Joi.number().required(),
    rating: Joi.number().required(),
    cancellationRate: Joi.number().required(),
    responseRate: Joi.number().required(),
    totalRevenue: Joi.number().required(),
  }).required(),
  milesCharges: Joi.object({
    ZeroToTenMiles: Joi.number().required(),
    ElevenToTwentyMiles: Joi.number().required(),
    TwentyOneToThirtyMiles: Joi.number().required(),
    ThirtyOneToFortyMiles: Joi.number().required(),
  }).required(),
  description: Joi.string().required(),
});

export const updateTierValidation = Joi.object({
  title: Joi.string().optional().allow(null, ""),
  level: Joi.number().integer().min(1).max(10).optional(),
  benefits: Joi.array().items(Joi.string()).optional(),
  minimumPerformanceFactorsValue: Joi.object({
    completedJobs: Joi.number().optional().allow(null, ""),
    acceptanceRate: Joi.number().optional().allow(null, ""),
    onTimeDelivery: Joi.number().optional().allow(null, ""),
    rating: Joi.number().optional().allow(null, ""),
    cancellationRate: Joi.number().optional().allow(null, ""),
    responseRate: Joi.number().optional().allow(null, ""),
    totalRevenue: Joi.number().optional().allow(null, ""),
  })
    .optional()
    .allow(null, ""),
  maximumPerformanceFactorsValue: Joi.object({
    completedJobs: Joi.number().optional().allow(null, ""),
    acceptanceRate: Joi.number().optional().allow(null, ""),
    onTimeDelivery: Joi.number().optional().allow(null, ""),
    rating: Joi.number().optional().allow(null, ""),
    cancellationRate: Joi.number().optional().allow(null, ""),
    responseRate: Joi.number().optional().allow(null, ""),
    totalRevenue: Joi.number().optional().allow(null, ""),
  })
    .optional()
    .allow(null, ""),
  milesCharges: Joi.object({
    ZeroToTenMiles: Joi.number().optional().allow(null, ""),
    ElevenToTwentyMiles: Joi.number().optional().allow(null, ""),
    TwentyOneToThirtyMiles: Joi.number().optional().allow(null, ""),
    ThirtyOneToFortyMiles: Joi.number().optional().allow(null, ""),
  })
    .optional()
    .allow(null, ""),
  description: Joi.string().optional().allow(null, ""),
});
