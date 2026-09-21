import Joi from "joi";

const KNOWLEDGE_CATEGORIES = [
  "dumpster_sizing",
  "junk_pricing_rules",
  "provider_terms",
  "policies",
  "commercial",
];

const TARGET_AUDIENCES = ["customer", "provider", "contractor", "all"];

export const createKnowledgeSchema = Joi.object({
  topic: Joi.string().trim().min(3).max(200).required().messages({
    "string.empty": "Topic cannot be empty",
    "string.min": "Topic must be at least 3 characters",
    "string.max": "Topic cannot exceed 200 characters",
    "any.required": "Topic is required",
  }),
  category: Joi.string()
    .valid(...KNOWLEDGE_CATEGORIES)
    .required()
    .messages({
      "any.only": `Category must be one of: ${KNOWLEDGE_CATEGORIES.join(", ")}`,
      "any.required": "Category is required",
    }),
  content: Joi.string().trim().min(5).required().messages({
    "string.empty": "Content cannot be empty",
    "string.min": "Content must be at least 5 characters long",
    "any.required": "Content is required",
  }),
  metadata: Joi.object({
    targetAudience: Joi.string()
      .valid(...TARGET_AUDIENCES)
      .default("all"),
    active: Joi.boolean().default(true),
  }).default(),
});

export const updateKnowledgeSchema = Joi.object({
  topic: Joi.string().trim().min(3).max(200).optional(),
  category: Joi.string()
    .valid(...KNOWLEDGE_CATEGORIES)
    .optional(),
  content: Joi.string().trim().min(5).optional(),
  metadata: Joi.object({
    targetAudience: Joi.string()
      .valid(...TARGET_AUDIENCES)
      .optional(),
    active: Joi.boolean().optional(),
  }).optional(),
}).min(1).messages({
  "object.min": "At least one field must be provided for update",
});

export const queryKnowledgeSchema = Joi.object({
  category: Joi.string()
    .valid(...KNOWLEDGE_CATEGORIES)
    .optional(),
  targetAudience: Joi.string()
    .valid(...TARGET_AUDIENCES)
    .optional(),
  active: Joi.boolean().optional(),
  search: Joi.string().trim().allow("").optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const idParamSchema = Joi.object({
  id: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid knowledge base ID format (must be 24-char hex ObjectId)",
      "any.required": "ID parameter is required",
    }),
});

export const rlhfFeedbackSchema = Joi.object({
  question: Joi.string().trim().required().messages({
    "any.required": "question is required",
  }),
  incorrectAnswer: Joi.string().allow("").optional(),
  correctedAnswer: Joi.string().trim().min(5).required().messages({
    "any.required": "correctedAnswer is required and must be at least 5 characters",
  }),
  topic: Joi.string().trim().min(3).max(200).required().messages({
    "any.required": "topic is required",
  }),
  category: Joi.string()
    .valid(...KNOWLEDGE_CATEGORIES)
    .required()
    .messages({
      "any.only": `Category must be one of: ${KNOWLEDGE_CATEGORIES.join(", ")}`,
      "any.required": "category is required",
    }),
  sessionId: Joi.string().allow("").optional(),
});

export const updateSettingsSchema = Joi.object({
  greetingMessage: Joi.string().trim().optional(),
  inactivityThresholdMinutes: Joi.number().integer().min(1).max(120).optional(),
  autoCheckoutEnabled: Joi.boolean().optional(),
  handoffEnabled: Joi.boolean().optional(),
  proactiveGreetingDelaySeconds: Joi.number().integer().min(0).max(60).optional(),
  enabledServices: Joi.array().items(Joi.string()).optional(),
}).min(1).messages({
  "object.min": "At least one setting must be provided for update",
});

