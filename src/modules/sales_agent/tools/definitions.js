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
        address: {
          type: "string",
          description: "Full street address of the delivery location if provided by user",
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
        address: {
          type: "string",
          description: "Customer's jobsite or delivery street address",
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
          description: "Selected dumpster size, unit, or junk volume (e.g., '20 Yard', '1/2 Truckload')",
        },
        junkVolume: {
          type: "string",
          description: "Junk removal estimated volume (e.g., 'Single Bulky Item', '1/4 Truckload', '1/2 Truckload', 'Full Truckload', 'Multiple Truckloads')",
        },
        treeNeed: {
          type: "string",
          description: "Tree service category (e.g., 'Tree removal', 'Fallen tree', 'Storm cleanup', 'Tree trimming', 'Property cleanup', 'Other')",
        },
        urgency: {
          type: "string",
          description: "Service urgency level (e.g., 'Emergency / Hazard', 'Within 24-48 Hours', 'This Week', 'Flexible')",
        },
        zipCode: {
          type: "string",
          description: "5-digit delivery ZIP code",
        },
        address: {
          type: "string",
          description: "Full street address of the jobsite / delivery location",
        },
        deliveryDate: {
          type: "string",
          description: "Requested delivery or service date (YYYY-MM-DD or timeframe)",
        },
        projectDescription: {
          type: "string",
          description: "Specific details or items to be handled",
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
          description: "Quoted base price in USD if verified (leave null for Tree Service where arborist review is required)",
        },
      },
      required: ["serviceType", "zipCode"],
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

export const findNearbyDumpsterProvidersTool = {
  type: "function",
  function: {
    name: "find_nearby_dumpster_providers",
    description:
      "Finds local dumpster providers and available dumpster sizes within a specific search radius of the customer's location, based on provider coverage areas and real distance.",
    parameters: {
      type: "object",
      properties: {
        zipCode: {
          type: "string",
          description: "5-digit US ZIP code of the delivery location",
        },
        address: {
          type: "string",
          description: "Full street address or delivery location",
        },
        radiusMiles: {
          type: "number",
          description: "Preferred search radius in miles (e.g. 15, 25, 40, 50). Defaults to 40 if not specified.",
        },
        serviceType: {
          type: "string",
          enum: ["Dumbster", "Junk Removal", "Tree Removal", "Porta Potty"],
          description: "Service type (defaults to Dumbster)",
        },
      },
      required: [],
    },
  },
};

export const SALES_TOOLS_DEFINITIONS = [
  checkServiceCoverageTool,
  captureLeadProfileTool,
  generatePrefilledCheckoutTool,
  escalateToHumanOrCommercialTool,
  findNearbyDumpsterProvidersTool,
];

export default SALES_TOOLS_DEFINITIONS;
