import SalesLead from "../../../models/SalesLead.js";
import SalesConversation from "../../../models/SalesConversation.js";
import { validateToolArguments } from "./validation.js";
import { createPrefilledCheckoutToken } from "./checkoutToken.js";
import { updateSessionFunnelState } from "../funnel/index.js";
import { checkRealServiceAvailability } from "../services/realAvailability.service.js";
import { logger } from "../../../config/logger.js";

/**
 * Handler 1: Check market coverage and delivery availability using real provider/inventory matching
 */
export async function handleCheckServiceCoverage(args, context = {}) {
  const { zipCode, serviceType, location } = args;

  // Run real geographical provider and inventory availability query
  const availability = await checkRealServiceAvailability({
    serviceType: serviceType || "Dumbster",
    zipCode,
    location: location || context.visitorLocation,
  });

  if (context.sessionId) {
    const patchData = {
      zipCode: availability.zipCode || zipCode,
      serviceType: availability.serviceType || serviceType,
      serviceable: availability.serviceable,
    };

    if (availability.location) {
      patchData.lat = availability.location.lat;
      patchData.lng = availability.location.lng;
      patchData.city = availability.location.city;
      patchData.state = availability.location.state;
    }

    if (Array.isArray(availability.availableSizes) && availability.availableSizes.length > 0) {
      patchData.availableSizes = availability.availableSizes;
    }

    await updateSessionFunnelState(context.sessionId, {
      collectedData: patchData,
    });
  }

  return availability;
}

/**
 * Handler 2: Capture and qualify customer contact details & project scope
 */
export async function handleCaptureLeadProfile(args, context = {}) {
  const {
    name,
    phone,
    email,
    zipCode,
    serviceType = "Dumbster",
    sizeOrVolume,
    projectDescription,
    intentCategory = "WARM",
  } = args;

  let lead = await SalesLead.findOne({ "contact.phone": phone });

  if (!lead) {
    lead = new SalesLead({
      contact: {
        name: name || "",
        phone: phone,
        email: email || "",
        zipCode: zipCode || "",
      },
      classification: intentCategory,
      serviceDetails: {
        serviceType,
        sizeOrVolume: sizeOrVolume || "",
        projectDescription: projectDescription || "",
      },
      status: "active_chat",
    });
  } else {
    // Update existing lead details
    if (name) lead.contact.name = name;
    if (email) lead.contact.email = email;
    if (zipCode) lead.contact.zipCode = zipCode;
    if (sizeOrVolume) lead.serviceDetails.sizeOrVolume = sizeOrVolume;
    if (projectDescription) lead.serviceDetails.projectDescription = projectDescription;
    lead.classification = intentCategory;
    lead.serviceDetails.serviceType = serviceType;
  }

  // Link to conversation if sessionId is present
  if (context.sessionId) {
    const conv = await SalesConversation.findOne({ sessionId: context.sessionId });
    if (conv) {
      lead.conversationRef = conv._id;
      await SalesConversation.updateOne({ _id: conv._id }, { $set: { leadRef: lead._id } });
    }

    await updateSessionFunnelState(context.sessionId, {
      collectedData: {
        customerName: name,
        customerPhone: phone,
        customerEmail: email,
        zipCode,
        serviceType,
        sizeOrVolume,
        projectDescription,
      },
    });
  }

  await lead.save();

  return {
    success: true,
    leadId: lead._id.toString(),
    classification: lead.classification,
    message: "Customer profile and project scope saved successfully.",
  };
}

/**
 * Handler 3: Generate prefilled checkout token and UI action card
 */
export async function handleGeneratePrefilledCheckout(args, context = {}) {
  const checkoutData = await createPrefilledCheckoutToken({
    ...args,
    sessionId: context.sessionId || null,
  });

  // Link token to lead document and update funnel state if present
  if (context.sessionId) {
    const conv = await SalesConversation.findOne({ sessionId: context.sessionId });
    if (conv?.leadRef) {
      await SalesLead.findByIdAndUpdate(conv.leadRef, {
        prefilledCheckoutToken: checkoutData.token,
        checkoutInitiated: true,
      });
    }

    await updateSessionFunnelState(context.sessionId, {
      currentFunnel: "dumpster_rental",
      collectedData: {
        ...args,
        checkoutInitiated: true,
      },
    });
  }

  // Create UI Action Card for Socket.io emission
  const actionCard = {
    cardType: "checkout_link",
    payload: {
      title: `Book ${args.sizeOrVolume || ""} ${args.serviceType || "Service"}`.trim(),
      checkoutUrl: checkoutData.checkoutUrl,
      token: checkoutData.token,
      summary: checkoutData.summary,
      buttonText: "Complete Instant Booking",
    },
  };

  return {
    success: true,
    checkoutUrl: checkoutData.checkoutUrl,
    token: checkoutData.token,
    expiresAt: checkoutData.expiresAt,
    summary: checkoutData.summary,
    actionCard,
    message: "Prefilled checkout link generated. Present the booking action card to the customer.",
  };
}

/**
 * Handler 4: Escalate high-ticket commercial / contractor inquiries
 */
export async function handleEscalateToHumanOrCommercial(args, context = {}) {
  const {
    companyName,
    contactName,
    phone,
    email,
    estimatedVolume,
    urgency = "HIGH",
    notes,
  } = args;

  let lead = await SalesLead.findOne({ "contact.phone": phone });

  if (!lead) {
    lead = new SalesLead({
      contact: {
        name: contactName,
        phone,
        email: email || "",
      },
      classification: "COMMERCIAL",
      serviceDetails: {
        serviceType: "Dumbster",
        projectDescription: `Commercial Escalation: ${notes || ""} (Volume: ${estimatedVolume || "Multi-unit"})`,
      },
      status: "handed_off",
      metadata: {
        companyName: companyName || "",
        urgency,
        escalatedAt: new Date().toISOString(),
      },
    });
  } else {
    lead.classification = "COMMERCIAL";
    lead.status = "handed_off";
    lead.metadata = {
      ...lead.metadata,
      companyName: companyName || "",
      urgency,
      escalatedAt: new Date().toISOString(),
    };
  }

  await lead.save();

  if (context.sessionId) {
    await updateSessionFunnelState(context.sessionId, {
      currentFunnel: "commercial_builder",
      collectedData: {
        companyName,
        contactName,
        customerPhone: phone,
        customerEmail: email,
        estimatedVolume,
      },
    });
  }

  logger.info(`🚨 Commercial Account Escalation: ${companyName || contactName} (${phone}) - Urgency: ${urgency}`);

  return {
    escalated: true,
    leadId: lead._id.toString(),
    department: "Dedicated Commercial Accounts Desk",
    priority: urgency,
    message: `Account inquiry for ${contactName} escalated to commercial dispatch. A senior trade specialist will follow up shortly.`,
  };
}

const TOOL_HANDLERS = {
  check_service_coverage: handleCheckServiceCoverage,
  capture_lead_profile: handleCaptureLeadProfile,
  generate_prefilled_checkout: handleGeneratePrefilledCheckout,
  escalate_to_human_or_commercial: handleEscalateToHumanOrCommercial,
};

/**
 * Master Dispatcher: Validates arguments and executes the requested tool handler
 *
 * @param {string} toolName - Name of the tool function
 * @param {Object|string} rawArgs - Tool arguments
 * @param {Object} [context={}] - Session & request context
 * @returns {Promise<{ success: boolean, result: Object, actionCard?: Object }>}
 */
export async function executeToolCall(toolName, rawArgs, context = {}) {
  const validation = validateToolArguments(toolName, rawArgs);

  if (!validation.ok) {
    logger.warn(`Tool argument validation failed for ${toolName}:`, validation.error);
    return {
      success: false,
      result: {
        error: validation.error,
        hint: validation.hint,
      },
    };
  }

  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return {
      success: false,
      result: {
        error: `Handler for '${toolName}' not implemented.`,
      },
    };
  }

  try {
    const result = await handler(validation.value, context);
    const actionCard = result?.actionCard || null;
    return {
      success: true,
      result,
      actionCard,
    };
  } catch (executionError) {
    logger.error(`Error executing tool '${toolName}':`, executionError);
    return {
      success: false,
      result: {
        error: `Tool execution encountered an internal error: ${executionError.message}`,
      },
    };
  }
}

export default {
  executeToolCall,
  handleCheckServiceCoverage,
  handleCaptureLeadProfile,
  handleGeneratePrefilledCheckout,
  handleEscalateToHumanOrCommercial,
};
