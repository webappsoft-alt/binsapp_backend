import SalesLead, { normalizeSalesServiceType } from "../../../models/SalesLead.js";
import SalesConversation from "../../../models/SalesConversation.js";
import { validateToolArguments } from "./validation.js";
import { createPrefilledCheckoutToken } from "./checkoutToken.js";
import { updateSessionFunnelState, getSessionFunnelState } from "../funnel/index.js";
import { checkRealServiceAvailability, resolveZipCoordinates, checkRealDumpsterAvailability } from "../services/realAvailability.service.js";
import { findNearbyDustbinProviders } from "../../../utils/dustbinMatching.js";
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
      if (availability.location.address) {
        patchData.address = availability.location.address;
        patchData.deliveryAddress = availability.location.address;
      }
    }

    if (context.visitorLocation) {
      if (context.visitorLocation.address) {
        patchData.address = patchData.address || context.visitorLocation.address;
        patchData.deliveryAddress = patchData.deliveryAddress || context.visitorLocation.deliveryAddress || context.visitorLocation.address;
      }
      if (context.visitorLocation.lat != null && patchData.lat == null) {
        patchData.lat = context.visitorLocation.lat;
      }
      if (context.visitorLocation.lng != null && patchData.lng == null) {
        patchData.lng = context.visitorLocation.lng;
      }
      if (context.visitorLocation.city && !patchData.city) {
        patchData.city = context.visitorLocation.city;
      }
      if (context.visitorLocation.state && !patchData.state) {
        patchData.state = context.visitorLocation.state;
      }
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
    address,
    city,
    state,
    lat,
    lng,
    serviceType = "Dumbster",
    sizeOrVolume,
    projectDescription,
    intentCategory = "WARM",
  } = args;

  const resolvedAddress = address || context.visitorLocation?.address || "";
  const resolvedCity = city || context.visitorLocation?.city || "";
  const resolvedState = state || context.visitorLocation?.state || "";
  const resolvedLat = lat != null ? lat : context.visitorLocation?.lat ?? null;
  const resolvedLng = lng != null ? lng : context.visitorLocation?.lng ?? null;
  const resolvedZip = zipCode || context.visitorLocation?.zipCode || context.visitorLocation?.zip || "";

  let lead = await SalesLead.findOne({ "contact.phone": phone });

  if (!lead) {
    lead = new SalesLead({
      contact: {
        name: name || "",
        phone: phone,
        email: email || "",
        zipCode: resolvedZip,
        address: resolvedAddress,
        city: resolvedCity,
        state: resolvedState,
        lat: resolvedLat,
        lng: resolvedLng,
      },
      classification: intentCategory,
      serviceDetails: {
        serviceType,
        sizeOrVolume: sizeOrVolume || "",
        projectDescription: projectDescription || "",
      },
      status: "new",
    });
  } else {
    // Update existing lead details
    if (name) lead.contact.name = name;
    if (email) lead.contact.email = email;
    if (resolvedZip) lead.contact.zipCode = resolvedZip;
    if (resolvedAddress) lead.contact.address = resolvedAddress;
    if (resolvedCity) lead.contact.city = resolvedCity;
    if (resolvedState) lead.contact.state = resolvedState;
    if (resolvedLat != null) lead.contact.lat = resolvedLat;
    if (resolvedLng != null) lead.contact.lng = resolvedLng;
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
        zipCode: resolvedZip,
        address: resolvedAddress,
        deliveryAddress: resolvedAddress,
        city: resolvedCity,
        state: resolvedState,
        lat: resolvedLat,
        lng: resolvedLng,
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
  let effectiveService = args.serviceType;
  let existingData = {};

  if (context.sessionId) {
    const sessionState = await getSessionFunnelState(context.sessionId);
    existingData = sessionState?.collectedData || {};
    if (context.activeFunnel === "junk_removal" || sessionState?.currentFunnel === "junk_removal") {
      effectiveService = "Junk Removal";
    } else if (context.activeFunnel === "tree_service" || sessionState?.currentFunnel === "tree_service") {
      effectiveService = "Tree Removal";
    }
  }

  const normalizedService = normalizeSalesServiceType(effectiveService);
  let targetFunnel = "dumpster_rental";
  let cardTitle = `Book ${args.sizeOrVolume || existingData.sizeOrVolume || ""} Dumpster Rental`.trim();
  let buttonText = "Complete Instant Booking";

  if (normalizedService === "Junk Removal") {
    targetFunnel = "junk_removal";
    cardTitle = "Request Junk Removal Service";
    buttonText = "Continue to Book";
  } else if (normalizedService === "Tree Removal") {
    targetFunnel = "tree_service";
    cardTitle = "Request Tree Service";
    buttonText = "Request Service";
  } else if (normalizedService === "Porta Potty") {
    targetFunnel = "porta_potty";
    cardTitle = "Book Portable Restrooms";
    buttonText = "Complete Instant Booking";
  }

  const mergedArgs = {
    address: context.visitorLocation?.address || existingData.address || existingData.deliveryAddress,
    deliveryAddress: context.visitorLocation?.deliveryAddress || context.visitorLocation?.address || existingData.deliveryAddress || existingData.address,
    zipCode: context.visitorLocation?.zipCode || context.visitorLocation?.zip || existingData.zipCode,
    city: context.visitorLocation?.city || existingData.city,
    state: context.visitorLocation?.state || existingData.state,
    lat: context.visitorLocation?.lat ?? existingData.lat,
    lng: context.visitorLocation?.lng ?? existingData.lng,
    ...existingData,
    ...args,
    serviceType: normalizedService,
    sessionId: context.sessionId || null,
  };

  const checkoutData = await createPrefilledCheckoutToken(mergedArgs);

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
      currentFunnel: targetFunnel,
      collectedData: {
        ...mergedArgs,
        checkoutInitiated: true,
      },
    });
  }

  const isManualReview = Boolean(checkoutData.summary?.manualReviewRequired);
  if (isManualReview) {
    if (normalizedService === "Tree Removal") {
      cardTitle = "Request Tree Service (Review Required)";
      buttonText = "Request Arborist Review";
    } else if (normalizedService === "Junk Removal") {
      cardTitle = "Request Junk Removal (Review Required)";
      buttonText = "Submit for Admin Review";
    }
  }

  // Create UI Action Card for Socket.io emission
  const actionCard = {
    cardType: "checkout_link",
    payload: {
      title: cardTitle,
      checkoutUrl: checkoutData.checkoutUrl,
      token: checkoutData.token,
      ref_token: checkoutData.token,
      manualReviewRequired: isManualReview,
      manualReviewReasons: checkoutData.summary?.manualReviewReasons || [],
      summary: checkoutData.summary,
      buttonText,
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

/**
 * Handler 5: Find nearby dumpster providers and available sizes within a search radius
 */
export async function handleFindNearbyDumpsterProviders(args, context = {}) {
  const { zipCode, address, radiusMiles = 40, serviceType = "Dumbster" } = args;

  let searchZip = zipCode || context.visitorLocation?.zip || context.previousFunnelState?.collectedData?.zipCode || "";
  let searchAddress = address || context.visitorLocation?.address || context.previousFunnelState?.collectedData?.address || "";

  let coords = null;
  if (context.explicitLocation?.lat != null && context.explicitLocation?.lng != null) {
    coords = {
      latitude: Number(context.explicitLocation.lat),
      longitude: Number(context.explicitLocation.lng),
      city: context.explicitLocation.city || "",
      state: context.explicitLocation.state || "",
    };
  } else if (context.visitorLocation?.lat != null && context.visitorLocation?.lng != null) {
    coords = {
      latitude: Number(context.visitorLocation.lat),
      longitude: Number(context.visitorLocation.lng),
      city: context.visitorLocation.city || "",
      state: context.visitorLocation.state || "",
    };
  }

  if (!coords && searchZip) {
    coords = await resolveZipCoordinates(searchZip);
  }

  if (!coords) {
    return {
      status: "needs_location",
      message: "Please provide your delivery street address or ZIP code so I can check nearby dumpster providers and available sizes within your area.",
      actionCard: {
        cardType: "location_picker",
        sessionId: context.sessionId,
        payload: {
          title: "Check Nearby Dumpster Providers",
          description: "Search your jobsite address or ZIP code with Google Places to find local haulers and available dumpster inventory.",
          detectedZip: searchZip || null,
          detectedAddress: searchAddress || null,
        },
      },
    };
  }

  const { latitude, longitude, city, state } = coords;

  try {
    const result = await findNearbyDustbinProviders({
      serviceQuery: {},
      quantity: 1,
      latitude,
      longitude,
      onlineOnly: false,
      cascade: false,
    });

    const allDustbins = result?.dustbins || [];
    const radiusMeters = radiusMiles * 1609.344;

    const nearbyDustbins = allDustbins.filter((d) => {
      const dist = d.distanceInMeters != null ? d.distanceInMeters : 0;
      return dist <= radiusMeters;
    });

    const uniqueProvidersMap = new Map();
    for (const d of nearbyDustbins) {
      const u = d.user;
      if (!u) continue;
      const uid = String(u._id || u.id);
      if (!uniqueProvidersMap.has(uid)) {
        const distMiles = Math.round((d.distanceInMeters / 1609.344) * 10) / 10;
        uniqueProvidersMap.set(uid, {
          providerId: uid,
          companyName: u.company?.name || u.name || `Local Verified Hauler #${uniqueProvidersMap.size + 1}`,
          distanceMiles: distMiles,
          status: u.status || "active",
          coverageRadius: d.serviceRadiusMiles || u.radius || 40,
          tier: u.operatorStats?.tier || 1,
        });
      }
    }

    const providers = Array.from(uniqueProvidersMap.values()).slice(0, 5);

    const availableSizes = await checkRealDumpsterAvailability({
      latitude,
      longitude,
      city,
      state,
      zip: searchZip,
    });

    const count = providers.length;
    let summaryText = "";
    if (count > 0) {
      summaryText = `Found ${count} verified local dumpster provider${count > 1 ? "s" : ""} serving ${city ? `${city}, ${state}` : (searchZip || "your area")} within ${radiusMiles} miles.`;
    } else {
      summaryText = `We found platform dumpster coverage for ${city ? `${city}, ${state}` : (searchZip || "your area")}. Our dispatcher network covers this region.`;
    }

    if (context.sessionId) {
      await updateSessionFunnelState(context.sessionId, {
        collectedData: {
          zipCode: searchZip,
          address: searchAddress,
          lat: latitude,
          lng: longitude,
          city,
          state,
          preferredRadius: radiusMiles,
          availableSizes: availableSizes.length > 0 ? availableSizes : undefined,
        },
      });
    }

    return {
      success: true,
      location: { city, state, zipCode: searchZip, lat: latitude, lng: longitude },
      radiusMiles,
      providersFound: count,
      providers,
      availableSizes,
      message: summaryText,
      actionCard: availableSizes.length > 0 ? {
        cardType: "sizing_picker",
        sessionId: context.sessionId,
        payload: {
          title: `Available Dumpsters within ${radiusMiles} Miles`,
          sizes: availableSizes,
        },
      } : null,
    };
  } catch (err) {
    logger.error("Error finding nearby dumpster providers:", err);
    return {
      success: false,
      error: err.message,
      message: "An error occurred while finding nearby providers. Please try again with your ZIP code.",
    };
  }
}

const TOOL_HANDLERS = {
  check_service_coverage: handleCheckServiceCoverage,
  capture_lead_profile: handleCaptureLeadProfile,
  generate_prefilled_checkout: handleGeneratePrefilledCheckout,
  escalate_to_human_or_commercial: handleEscalateToHumanOrCommercial,
  find_nearby_dumpster_providers: handleFindNearbyDumpsterProviders,
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
