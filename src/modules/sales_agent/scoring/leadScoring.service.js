/**
 * Dynamic Lead Scoring & Intent Classification Engine
 */

const COMMERCIAL_KEYWORDS_REGEX =
  /\b(contractor|builder|roofing|commercial|multi-location|flips|remodeler|recurring|weekly swap|10\+|trade discount|net-30)\b/i;

const PROVIDER_KEYWORDS_REGEX =
  /\b(hauler|operator partner|my trucks|fleet|vendor onboarding|payout schedule|equipment supplier)\b/i;

const SUPPORT_KEYWORDS_REGEX =
  /\b(order (?:number|#|\d+)|where is my (?:driver|bin|dumpster)|damage|bin swap|pickup status|already paid|my receipt)\b/i;

const URGENCY_KEYWORDS_REGEX =
  /\b(today|tomorrow|asap|urgent|emergency|right now|in 24 hours|within 48 hours|first thing)\b/i;

/**
 * Evaluates a lead's qualification score (0-100) and classifies intent.
 *
 * @param {Object} leadData - SalesLead data object
 * @param {Array<Object>} [conversationHistory=[]] - Chat messages history
 * @returns {{ score: number, classification: string, signals: string[], recommendedAction: string }}
 */
export function evaluateLeadScore(leadData = {}, conversationHistory = []) {
  let score = 0;
  const signals = [];

  const contact = leadData.contact || {};
  const serviceDetails = leadData.serviceDetails || {};

  // 1. Contact Information Completeness (Up to 50 pts)
  if (contact.phone && typeof contact.phone === "string" && contact.phone.trim().length >= 7) {
    score += 25;
    signals.push("VERIFIED_PHONE_CAPTURED");
  }

  if (contact.email && typeof contact.email === "string" && contact.email.includes("@")) {
    score += 15;
    signals.push("VERIFIED_EMAIL_CAPTURED");
  }

  if (contact.name && typeof contact.name === "string" && contact.name.trim().length > 1) {
    score += 10;
    signals.push("CUSTOMER_NAME_PROVIDED");
  }

  // 2. Project Scope Specificity (Up to 30 pts)
  if (contact.zipCode && /^\d{5}$/.test(String(contact.zipCode).trim())) {
    score += 10;
    signals.push("TARGET_ZIP_SPECIFIED");
  }

  if (serviceDetails.sizeOrVolume && String(serviceDetails.sizeOrVolume).trim().length > 0) {
    score += 10;
    signals.push("SERVICE_SIZE_CONFIRMED");
  }

  if (serviceDetails.projectDescription && String(serviceDetails.projectDescription).trim().length > 3) {
    score += 10;
    signals.push("PROJECT_DESCRIPTION_PROVIDED");
  }

  // 3. Funnel Progression (Up to 20 pts)
  if (leadData.checkoutInitiated || leadData.prefilledCheckoutToken) {
    score += 20;
    signals.push("CHECKOUT_TOKEN_GENERATED");
  }

  // 4. Conversation Text & Keyword Intent Analysis
  const fullTranscriptText = conversationHistory
    .map((m) => m?.content || "")
    .join(" ") + " " + (serviceDetails.projectDescription || "");

  let overrideClassification = null;

  if (COMMERCIAL_KEYWORDS_REGEX.test(fullTranscriptText)) {
    overrideClassification = "COMMERCIAL";
    score = Math.min(100, score + 20);
    signals.push("COMMERCIAL_ACCOUNT_SIGNALS_DETECTED");
  } else if (PROVIDER_KEYWORDS_REGEX.test(fullTranscriptText)) {
    overrideClassification = "PROVIDER";
    signals.push("HAULER_PROVIDER_INQUIRY");
  } else if (SUPPORT_KEYWORDS_REGEX.test(fullTranscriptText)) {
    overrideClassification = "SUPPORT";
    signals.push("CUSTOMER_SUPPORT_INQUIRY");
  }

  if (URGENCY_KEYWORDS_REGEX.test(fullTranscriptText)) {
    score = Math.min(100, score + 15);
    signals.push("HIGH_URGENCY_TIMEFRAME");
  }

  // 5. Determine Final Classification
  let classification = overrideClassification;
  if (!classification) {
    if (score >= 70) {
      classification = "HOT";
    } else if (score >= 35 || contact.phone || contact.email) {
      classification = "WARM";
    } else {
      classification = "COLD";
    }
  }

  // 6. Formulate Recommended Action
  let recommendedAction = "Continue consultative AI sales dialogue.";
  switch (classification) {
    case "COMMERCIAL":
      recommendedAction = "Escalate to dedicated commercial sales desk for trade terms and volume quotes.";
      break;
    case "HOT":
      recommendedAction = "Present one-click prefilled checkout card to secure same-day/next-day booking.";
      break;
    case "WARM":
      recommendedAction = "Gather delivery address/zip and confirm dumpster size requirements.";
      break;
    case "PROVIDER":
      recommendedAction = "Route to vendor onboarding team for fleet partnership review.";
      break;
    case "SUPPORT":
      recommendedAction = "Transfer to customer support team with active order ID.";
      break;
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    classification,
    signals,
    recommendedAction,
  };
}

export default {
  evaluateLeadScore,
};
