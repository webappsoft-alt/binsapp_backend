/**
 * OpenAI Function Calling Tool Definitions for BinsApp AI Sales Agent
 */

export const checkServiceCoverageTool = {
  type: "function",
  function: {
    name: "check_service_coverage",
    description:
      "Checks whether BinsApp provides dumpster rental, porta potty, junk removal, or tree removal services in a specific US ZIP code.",
    parameters: {
      type: "object",
      properties: {
        zipCode: {
          type: "string",
          description: "5-digit US ZIP code of the delivery location (e.g. '78701')",
        },
        serviceType: {
          type: "string",
          enum: ["Dumbster", "Porta Potty", "Junk Removal", "Tree Removal"],
          description: "Type of service requested",
        },
      },
      required: ["zipCode", "serviceType"],
    },
  },
};

export const captureLeadProfileTool = {
  type: "function",
  function: {
    name: "capture_lead_profile",
    description:
      "Captures customer contact details and project scope into a qualified sales lead for follow-up and checkout tracking.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Customer's full or first name",
        },
        phone: {
          type: "string",
          description: "Customer's phone number (e.g., '+15125550199' or '512-555-0199')",
        },
        email: {
          type: "string",
          description: "Customer's email address",
        },
        zipCode: {
          type: "string",
          description: "5-digit US delivery ZIP code",
        },
        serviceType: {
          type: "string",
          enum: ["Dumbster", "Porta Potty", "Junk Removal", "Tree Removal", "Other"],
          description: "Service category requested",
        },
        sizeOrVolume: {
          type: "string",
          description: "Size or volume required (e.g., '20 Yard', '30 Yard', '1 Standard Unit', 'Full Truck')",
        },
        projectDescription: {
          type: "string",
          description: "Brief summary of the project (e.g. 'Roof replacement tear-off', 'Garage cleanout')",
        },
        intentCategory: {
          type: "string",
          enum: ["HOT", "WARM", "COMMERCIAL", "PROVIDER", "SUPPORT"],
          description: "Lead temperature and intent classification",
        },
      },
      required: ["phone", "serviceType", "intentCategory"],
    },
  },
};

export const generatePrefilledCheckoutTool = {
  type: "function",
  function: {
    name: "generate_prefilled_checkout",
    description:
      "Generates an actionable, one-click prefilled checkout URL and action card for a customer who has selected a dumpster or service.",
    parameters: {
      type: "object",
      properties: {
        serviceType: {
          type: "string",
          enum: ["Dumbster", "Porta Potty", "Junk Removal", "Tree Removal"],
          description: "Selected service",
        },
        sizeOrVolume: {
          type: "string",
          description: "Selected size or unit (e.g., '20 Yard', '30 Yard')",
        },
        zipCode: {
          type: "string",
          description: "5-digit delivery ZIP code",
        },
        deliveryDate: {
          type: "string",
          description: "Requested delivery date (YYYY-MM-DD)",
        },
        customerName: {
          type: "string",
          description: "Customer full name",
        },
        customerPhone: {
          type: "string",
          description: "Customer contact phone",
        },
        customerEmail: {
          type: "string",
          description: "Customer email",
        },
        estimatedPrice: {
          type: "number",
          description: "Quoted base price in USD",
        },
      },
      required: ["serviceType", "sizeOrVolume", "zipCode"],
    },
  },
};

export const escalateToHumanOrCommercialTool = {
  type: "function",
  function: {
    name: "escalate_to_human_or_commercial",
    description:
      "Escalates high-volume commercial builders, contractor partnerships, or urgent enterprise requests directly to the dedicated human commercial sales desk.",
    parameters: {
      type: "object",
      properties: {
        companyName: {
          type: "string",
          description: "Company or contractor trade business name",
        },
        contactName: {
          type: "string",
          description: "Primary point of contact name",
        },
        phone: {
          type: "string",
          description: "Contact phone number",
        },
        email: {
          type: "string",
          description: "Contact email address",
        },
        estimatedVolume: {
          type: "string",
          description: "Estimated monthly or recurring bin volume (e.g., '4 bins weekly', 'multi-location')",
        },
        urgency: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
          description: "Urgency level of the request",
        },
        notes: {
          type: "string",
          description: "Specific requirements or job site logistics notes",
        },
      },
      required: ["contactName", "phone", "urgency", "notes"],
    },
  },
};

export const SALES_TOOLS_DEFINITIONS = [
  checkServiceCoverageTool,
  captureLeadProfileTool,
  generatePrefilledCheckoutTool,
  escalateToHumanOrCommercialTool,
];

export default SALES_TOOLS_DEFINITIONS;
