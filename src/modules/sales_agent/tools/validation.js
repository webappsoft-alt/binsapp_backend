import Joi from "joi";

export const checkServiceCoverageArgsSchema = Joi.object({
  zipCode: Joi.string()
    .trim()
    .regex(/^\d{5}$/)
    .required()
    .messages({
      "string.pattern.base": "ZIP code must be a valid 5-digit US postal code (e.g., '78701')",
      "any.required": "zipCode is required",
    }),
  serviceType: Joi.string()
    .valid("Dumbster", "Porta Potty", "Junk Removal", "Tree Removal")
    .required()
    .messages({
      "any.only": "serviceType must be one of: 'Dumbster', 'Porta Potty', 'Junk Removal', 'Tree Removal'",
      "any.required": "serviceType is required",
    }),
});

export const captureLeadProfileArgsSchema = Joi.object({
  name: Joi.string().trim().allow("").optional(),
  phone: Joi.string().trim().min(7).max(25).required().messages({
    "string.empty": "Phone number cannot be empty",
    "string.min": "Phone number must be at least 7 digits",
    "any.required": "phone is required",
  }),
  email: Joi.string().email().allow("").optional(),
  zipCode: Joi.string().trim().allow("").optional(),
  serviceType: Joi.string()
    .valid("Dumbster", "Porta Potty", "Junk Removal", "Tree Removal", "Other")
    .default("Dumbster"),
  sizeOrVolume: Joi.string().trim().allow("").optional(),
  projectDescription: Joi.string().trim().allow("").optional(),
  intentCategory: Joi.string()
    .valid("HOT", "WARM", "COMMERCIAL", "PROVIDER", "SUPPORT")
    .default("WARM"),
});

export const generatePrefilledCheckoutArgsSchema = Joi.object({
  serviceType: Joi.string()
    .valid("Dumbster", "Porta Potty", "Junk Removal", "Tree Removal")
    .required(),
  sizeOrVolume: Joi.string().trim().required().messages({
    "any.required": "sizeOrVolume is required (e.g., '20 Yard', '30 Yard')",
  }),
  zipCode: Joi.string()
    .trim()
    .regex(/^\d{5}$/)
    .required()
    .messages({
      "string.pattern.base": "ZIP code must be a valid 5-digit US postal code",
      "any.required": "zipCode is required",
    }),
  deliveryDate: Joi.string().trim().allow("").optional(),
  customerName: Joi.string().trim().allow("").optional(),
  customerPhone: Joi.string().trim().allow("").optional(),
  customerEmail: Joi.string().email().allow("").optional(),
  estimatedPrice: Joi.number().min(0).optional(),
});

export const escalateToHumanOrCommercialArgsSchema = Joi.object({
  companyName: Joi.string().trim().allow("").optional(),
  contactName: Joi.string().trim().required().messages({
    "any.required": "contactName is required",
  }),
  phone: Joi.string().trim().min(7).max(25).required().messages({
    "any.required": "phone number is required",
  }),
  email: Joi.string().email().allow("").optional(),
  estimatedVolume: Joi.string().trim().allow("").optional(),
  urgency: Joi.string().valid("LOW", "MEDIUM", "HIGH").default("MEDIUM"),
  notes: Joi.string().trim().required().messages({
    "any.required": "notes summary is required",
  }),
});

const TOOL_SCHEMAS = {
  check_service_coverage: checkServiceCoverageArgsSchema,
  capture_lead_profile: captureLeadProfileArgsSchema,
  generate_prefilled_checkout: generatePrefilledCheckoutArgsSchema,
  escalate_to_human_or_commercial: escalateToHumanOrCommercialArgsSchema,
};

/**
 * Validates raw arguments from an OpenAI tool call against strict Joi schemas
 * with built-in self-healing error formatting.
 *
 * @param {string} toolName - Name of the tool function
 * @param {Object|string} rawArgs - Raw arguments object or JSON string
 * @returns {{ ok: boolean, value?: Object, error?: string, hint?: string }}
 */
export function validateToolArguments(toolName, rawArgs) {
  let parsedArgs = rawArgs;

  if (typeof rawArgs === "string") {
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch (parseError) {
      return {
        ok: false,
        error: `JSON_SYNTAX_ERROR: Tool arguments could not be parsed. Error: ${parseError.message}`,
        hint: "Ensure valid JSON format for tool arguments.",
      };
    }
  }

  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) {
    return {
      ok: false,
      error: `UNKNOWN_TOOL: Tool '${toolName}' is not recognized in the system.`,
      hint: "Use one of the registered function names.",
    };
  }

  const { error, value } = schema.validate(parsedArgs, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorDetails = error.details.map((d) => d.message.replace(/"/g, "")).join("; ");
    return {
      ok: false,
      error: `VALIDATION_FAILED: ${errorDetails}`,
      hint: `Please correct the parameters for '${toolName}' and re-execute.`,
    };
  }

  return {
    ok: true,
    value,
  };
}

export default {
  validateToolArguments,
  checkServiceCoverageArgsSchema,
  captureLeadProfileArgsSchema,
  generatePrefilledCheckoutArgsSchema,
  escalateToHumanOrCommercialArgsSchema,
};
