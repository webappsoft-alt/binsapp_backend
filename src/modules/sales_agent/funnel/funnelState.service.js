import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";
import { normalizeSalesServiceType } from "../../../models/SalesLead.js";
import Dumbster from "../../../models/Dumbster.js";

const FUNNEL_STATE_TTL_SECONDS = 7200; // 2 Hours
const FUNNEL_KEY_PREFIX = "sales:session:";
const BASE_FRONTEND_URL = process.env.REDIRECT_FRONTEND_URL || "https://www.binsapp.ai";

export const PRIMARY_INTENT_OPTIONS = [
  { label: "I NEED A SERVICE", value: "I need a service" },
  { label: "I’M A CONTRACTOR / PROFESSIONAL", value: "I'm a contractor or professional" },
  { label: "I WANT TO JOIN AS A PROVIDER", value: "I want to join as a provider" },
  { label: "I’M A BUILDER / COMMERCIAL CUSTOMER", value: "I'm a builder or commercial customer" },
  { label: "I HAVE A QUESTION", value: "I have a question" },
];

export const SERVICE_SELECTION_OPTIONS = [
  { label: "🗑 Dumpster Rental", value: "Dumpster Rental" },
  { label: "🚛 Junk Removal", value: "Junk Removal" },
  { label: "🌳 Tree Service", value: "Tree Service" },
  { label: "🚽 Porta Potty Rental", value: "Porta Potty Rental" },
];

export const DEFAULT_DUMPSTER_SIZES = [
  {
    size: "10 Yard",
    dimensions: "14ft L × 7.5ft W × 3.5ft H",
    capacity: "~3-4 Pickup Loads (2 Tons Included)",
    bestFor: "Small garage/basement cleanouts, single room remodel, yard debris",
    startingPrice: 349,
  },
  {
    size: "20 Yard",
    dimensions: "22ft L × 8ft W × 4.5ft H",
    capacity: "~6-8 Pickup Loads (3 Tons Included)",
    bestFor: "Deck removal, multi-room cleanout, roof replacement (most popular)",
    startingPrice: 425,
    isPopular: true,
  },
  {
    size: "30 Yard",
    dimensions: "22ft L × 8ft W × 6ft H",
    capacity: "~9-12 Pickup Loads (4 Tons Included)",
    bestFor: "Major home addition, commercial demolition, whole home estate cleanout",
    startingPrice: 525,
  },
  {
    size: "40 Yard",
    dimensions: "22ft L × 8ft W × 8ft H",
    capacity: "~12-16 Pickup Loads (5-6 Tons Included)",
    bestFor: "Large commercial project, new construction, major disaster remediation",
    startingPrice: 649,
  },
];

/**
 * Retrieves live dumpster sizing and pricing records from MongoDB,
 * falling back to default specifications if database records are unavailable.
 * @returns {Promise<Array<Object>>}
 */
export async function getLiveDumpsterSizes() {
  try {
    const list = await Dumbster.find({ status: { $ne: "inactive" } }).lean();
    if (list && list.length > 0) {
      return list.map((item) => {
        const rawSize = item.size || item.description || "Dumpster";
        let displaySize = rawSize;
        if (!displaySize.toLowerCase().includes("yard")) {
          displaySize = `${displaySize} Yard`;
        }
        return {
          id: String(item._id),
          size: displaySize,
          dimensions: item.dimension ? `${item.dimension} ft` : "Standard Dimensions",
          capacity: item.weight || (item.tons ? `${item.tons} tons included` : "2-3 Tons Included"),
          bestFor: item.usage || item.description || "General cleanouts & renovations",
          startingPrice: Number(item.price) || Number(item.three_days_price) || 349,
          threeDaysPrice: item.three_days_price || null,
          sevenDaysPrice: item.seven_days_price || null,
          isPopular: displaySize.includes("20") || displaySize.includes("18-20"),
        };
      });
    }
  } catch (err) {
    logger.warn("Error fetching live dumpster sizes from MongoDB:", err?.message);
  }
  return DEFAULT_DUMPSTER_SIZES;
}

/**
 * Normalizes relative, textual, or ISO dates into standard YYYY-MM-DD string
 * Supports: "tomorrow", "next Friday", "September 10", "Sep 10, 2026", "in 3 days", "9/10", "2026-09-10"
 *
 * @param {string} text
 * @returns {string|null}
 */
export function normalizeDate(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase().trim();
  const now = new Date();
  const currentYear = now.getFullYear();

  // 1. Today / Now / ASAP
  if (/\b(today|now|asap)\b/i.test(lower)) {
    return now.toISOString().split("T")[0];
  }

  // 2. Tomorrow
  if (/\btomorrow\b/i.test(lower)) {
    const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return d.toISOString().split("T")[0];
  }

  // 3. In X days / in a week
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) {
    const d = new Date(now.getTime() + parseInt(inDaysMatch[1], 10) * 24 * 60 * 60 * 1000);
    return d.toISOString().split("T")[0];
  }
  if (/\bin\s+(?:a|1)\s+week\b/i.test(lower)) {
    const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().split("T")[0];
  }

  // 4. ISO format: YYYY-MM-DD
  const isoMatch = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(isoMatch[2]).padStart(2, "0");
    const d = String(isoMatch[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 5. Month name variations: 'September 10', 'Sep 10, 2026', 'Sep 10th', '10 September', '10th of September'
  const months = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12
  };
  const monthNamesPattern = Object.keys(months).join("|");

  // Month then Day: 'September 10', 'Sep 10th', 'Sep 10, 2026', 'Sep 10 2026'
  const monthDayRegex = new RegExp(`\\b(${monthNamesPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i");
  const mdMatch = lower.match(monthDayRegex);
  if (mdMatch) {
    const monthNum = months[mdMatch[1].toLowerCase()];
    const dayNum = parseInt(mdMatch[2], 10);
    const yearNum = mdMatch[3] ? parseInt(mdMatch[3], 10) : currentYear;
    if (monthNum && dayNum >= 1 && dayNum <= 31) {
      const mStr = String(monthNum).padStart(2, "0");
      const dStr = String(dayNum).padStart(2, "0");
      return `${yearNum}-${mStr}-${dStr}`;
    }
  }

  // Day then Month: '10 September', '10th of September', '10th Sep 2026'
  const dayMonthRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${monthNamesPattern})(?:,?\\s+(\\d{4}))?\\b`, "i");
  const dmMatch = lower.match(dayMonthRegex);
  if (dmMatch) {
    const dayNum = parseInt(dmMatch[1], 10);
    const monthNum = months[dmMatch[2].toLowerCase()];
    const yearNum = dmMatch[3] ? parseInt(dmMatch[3], 10) : currentYear;
    if (monthNum && dayNum >= 1 && dayNum <= 31) {
      const mStr = String(monthNum).padStart(2, "0");
      const dStr = String(dayNum).padStart(2, "0");
      return `${yearNum}-${mStr}-${dStr}`;
    }
  }

  // 6. Weekdays: 'this friday', 'next friday', 'friday', 'next monday'
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < weekdays.length; i++) {
    const dayName = weekdays[i];
    const weekdayRegex = new RegExp(`\\b(this\\s+|next\\s+)?${dayName}\\b`, "i");
    const wMatch = lower.match(weekdayRegex);
    if (wMatch) {
      const modifier = (wMatch[1] || "").trim();
      const currentDay = now.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      if (modifier === "next" && diff < 7) {
        diff += 7;
      }
      const targetDate = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
      return targetDate.toISOString().split("T")[0];
    }
  }

  // 7. MM/DD or MM/DD/YYYY
  const slashMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const month = String(slashMatch[1]).padStart(2, "0");
    const day = String(slashMatch[2]).padStart(2, "0");
    const year = slashMatch[3] ? (slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]) : currentYear;
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Extracts multiple structured fields from a single natural language user message
 *
 * @param {string} text - User message
 * @param {Object} [existingData={}] - Already collected fields
 * @returns {Object} Newly extracted and updated fields
 */
export function extractEntitiesFromMessage(text = "", existingData = {}) {
  if (!text || typeof text !== "string") return { ...existingData };

  const lower = text.toLowerCase();
  const extracted = { ...existingData };

  // 1. Primary Intent Detection
  if (lower.includes("need a service") || lower.includes("book a service") || lower.includes("rent a")) {
    extracted.primaryIntent = "I NEED A SERVICE";
  } else if (lower.includes("contractor") || lower.includes("professional") || lower.includes("remodeler") || lower.includes("roofer")) {
    extracted.primaryIntent = "I’M A CONTRACTOR / PROFESSIONAL";
  } else if (lower.includes("join as a provider") || lower.includes("become a vendor") || lower.includes("hauler registration") || lower.includes("operator partner")) {
    extracted.primaryIntent = "I WANT TO JOIN AS A PROVIDER";
  } else if (lower.includes("builder") || lower.includes("commercial customer") || lower.includes("commercial account") || lower.includes("multi-location")) {
    extracted.primaryIntent = "I’M A BUILDER / COMMERCIAL CUSTOMER";
  } else if (lower.includes("have a question") || lower.includes("faq") || lower.includes("how does it work")) {
    extracted.primaryIntent = "I HAVE A QUESTION";
  }

  // 2. Service Type Detection
  if (lower.includes("dumpster") || lower.includes("dumbster") || lower.includes("roll-off") || lower.includes("roll off") || lower.includes("bin")) {
    extracted.serviceType = "Dumbster";
  } else if (lower.includes("junk") || lower.includes("haul away") || lower.includes("trash cleanout")) {
    extracted.serviceType = "Junk Removal";
  } else if (lower.includes("tree") || lower.includes("stump") || lower.includes("limb") || lower.includes("branch")) {
    extracted.serviceType = "Tree Removal";
  } else if (lower.includes("porta") || lower.includes("potty") || lower.includes("restroom") || lower.includes("portable sanitation")) {
    extracted.serviceType = "Porta Potty";
  }

  // 3. Dumpster Size / Volume
  const sizeMatch = text.match(/\b(10|12|15|20|30|40)\s*(?:yard|yd|yards|yds)?\b/i);
  if (sizeMatch && (extracted.serviceType === "Dumbster" || !extracted.serviceType)) {
    extracted.sizeOrVolume = `${sizeMatch[1]} Yard`;
    if (!extracted.serviceType) extracted.serviceType = "Dumbster";
  }

  // 4. US 5-Digit ZIP Code
  const zipMatch = text.match(/\b\d{5}\b/);
  if (zipMatch) {
    extracted.zipCode = zipMatch[0];
  }

  // 5. Project Description / Project Type (Dumpster, Junk, Tree)
  if (lower.includes("roof") || lower.includes("shingle")) {
    extracted.projectType = "Roofing";
    extracted.projectDescription = "Roof replacement";
  } else if (lower.includes("spring clean") || lower.includes("garage clean") || lower.includes("basement clean") || lower.includes("declutter")) {
    extracted.projectType = "Spring Cleaning";
    extracted.projectDescription = "Garage / Basement Cleanout";
  } else if (lower.includes("remodel") || lower.includes("renovat") || lower.includes("kitchen") || lower.includes("bathroom")) {
    extracted.projectType = "Remodeling";
    extracted.projectDescription = "Remodeling project";
  } else if (lower.includes("construct") || lower.includes("addition") || lower.includes("new build")) {
    extracted.projectType = "Construction";
    extracted.projectDescription = "Construction Debris";
  } else if (lower.includes("furniture") || lower.includes("appliance") || lower.includes("couch") || lower.includes("mattress")) {
    extracted.projectDescription = "Furniture & Appliances";
  } else if (lower.includes("yard") || lower.includes("brush") || lower.includes("landscap")) {
    extracted.projectType = "Yard Debris";
    extracted.projectDescription = "Yard Waste & Debris";
  } else if (lower.includes("estate cleanout") || lower.includes("whole house") || lower.includes("property cleanout")) {
    extracted.projectDescription = "Full Property Cleanout";
  } else if (lower.includes("single item") || lower.includes("bulky item")) {
    extracted.projectDescription = "Single Bulky Item";
  } else if (lower.includes("tree removal") || lower.includes("cut down")) {
    extracted.projectDescription = "Tree Removal";
  } else if (lower.includes("trim") || lower.includes("prun")) {
    extracted.projectDescription = "Tree Trimming & Pruning";
  } else if (lower.includes("stump")) {
    extracted.projectDescription = "Stump Grinding";
  } else if (lower.includes("storm") || lower.includes("emergency tree")) {
    extracted.projectDescription = "Emergency Storm Damage";
  }

  // Contractor Business Type & Frequency
  if (lower.includes("general contractor")) extracted.businessType = "General Contractor";
  if (lower.includes("roofer") || lower.includes("roofing contractor")) extracted.businessType = "Roofing Contractor";
  if (lower.includes("weekly") || lower.includes("recurring") || lower.includes("every week")) extracted.serviceFrequency = "Weekly";
  if (lower.includes("monthly")) extracted.serviceFrequency = "Monthly";
  if (lower.includes("one off") || lower.includes("one-off") || lower.includes("just this job")) extracted.serviceFrequency = "One-off";

  // Provider details
  if (lower.includes("truck") || lower.includes("fleet")) {
    const truckMatch = text.match(/(\d+)\s*(?:trucks?|fleet|haulers?)/i);
    if (truckMatch) extracted.fleetCount = truckMatch[1];
  }

  // Porta Potty specific
  if (extracted.serviceType === "Porta Potty" || lower.includes("porta") || lower.includes("potty")) {
    if (lower.includes("construction") || lower.includes("jobsite")) extracted.useCase = "Construction Jobsite";
    if (lower.includes("event") || lower.includes("wedding") || lower.includes("party")) extracted.useCase = "Special Event";
    if (lower.includes("commercial") || lower.includes("industrial")) extracted.useCase = "Commercial / Industrial";
    if (lower.includes("home renovation")) extracted.useCase = "Home Renovation";

    const unitMatch = text.match(/(\d+)\s*(?:units?|toilets?|restrooms?)/i);
    if (unitMatch) extracted.units = `${unitMatch[1]} Units`;
    else if (lower.includes("1 standard") || lower.includes("1 unit")) extracted.units = "1 Standard Unit";
    else if (lower.includes("2-4 units")) extracted.units = "2-4 Units";
    else if (lower.includes("5-10 units")) extracted.units = "5-10 Units";

    const durationMatch = text.match(/(\d+)\s*(?:weeks?|months?|days?)/i);
    if (durationMatch) extracted.duration = durationMatch[0];
    else if (lower.includes("weekend")) extracted.duration = "Weekend (1-3 Days)";
    else if (lower.includes("1-2 weeks")) extracted.duration = "1-2 Weeks";
    else if (lower.includes("1 month")) extracted.duration = "1 Month";
  }

  // 6. Delivery Date (Natural language & ISO)
  const parsedDate = normalizeDate(text);
  if (parsedDate) {
    extracted.deliveryDate = parsedDate;
  }

  // 7. Phone Number
  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
  if (phoneMatch) {
    extracted.customerPhone = phoneMatch[0].trim();
  }

  // 8. Email Address
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) {
    extracted.customerEmail = emailMatch[0].toLowerCase().trim();
  }

  // 9. Photo URLs from chat uploads
  const urlMatch = text.match(/https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp|heic|heif|gif|avif)/gi);
  if (urlMatch) {
    const existingPhotos = Array.isArray(extracted.photos) ? extracted.photos : [];
    extracted.photos = Array.from(new Set([...existingPhotos, ...urlMatch]));
  }

  return extracted;
}

/**
 * Calculates current and next step state in the active funnel
 *
 * @param {string} [funnel="initial"]
 * @param {Object} [collectedData={}]
 * @returns {{ currentFunnel: string, currentStep: string, nextStep: string, missingFields: string[], isComplete: boolean }}
 */
export function calculateFunnelStep(funnel = "initial", collectedData = {}) {
  // 1. If serviceType is explicitly selected or captured, that service funnel takes precedence
  let currentFunnel = funnel;
  if (collectedData.serviceType) {
    const normalized = normalizeSalesServiceType(collectedData.serviceType);
    if (normalized === "Dumbster") currentFunnel = "dumpster_rental";
    else if (normalized === "Junk Removal") currentFunnel = "junk_removal";
    else if (normalized === "Tree Removal") currentFunnel = "tree_service";
    else if (normalized === "Porta Potty") currentFunnel = "porta_potty";
  } else if (collectedData.primaryIntent === "I WANT TO JOIN AS A PROVIDER") {
    currentFunnel = "provider_onboarding";
  } else if (collectedData.primaryIntent === "I’M A CONTRACTOR / PROFESSIONAL") {
    currentFunnel = "contractor_professional";
  } else if (collectedData.primaryIntent === "I’M A BUILDER / COMMERCIAL CUSTOMER") {
    currentFunnel = "commercial_builder";
  } else if (collectedData.primaryIntent === "I HAVE A QUESTION") {
    currentFunnel = "general_faq";
  } else if (
    collectedData.primaryIntent === "I NEED A SERVICE" ||
    String(collectedData.primaryIntent || "").toLowerCase().includes("need a service")
  ) {
    currentFunnel = "service_booking";
  }

  // Handle Initial Intent State
  if (!collectedData.primaryIntent && (currentFunnel === "initial_intent" || currentFunnel === "initial")) {
    return {
      currentFunnel: "initial_intent",
      currentStep: "intent_selection",
      nextStep: "service_selection",
      missingFields: ["primaryIntent"],
      isComplete: false,
    };
  }

  // Handle Service Selection State (user chose "I NEED A SERVICE", now selects service type)
  if (currentFunnel === "service_booking" && !collectedData.serviceType) {
    return {
      currentFunnel: "service_booking",
      currentStep: "service_selection",
      nextStep: "location",
      missingFields: ["serviceType"],
      isComplete: false,
    };
  }

  // 1. Dumpster Rental Funnel
  if (currentFunnel === "dumpster_rental") {
    if (!collectedData.zipCode) {
      const missing = ["zipCode"];
      if (!collectedData.sizeOrVolume) missing.push("sizeOrVolume");
      if (!collectedData.deliveryDate) missing.push("deliveryDate");
      return {
        currentFunnel: "dumpster_rental",
        currentStep: "location",
        nextStep: collectedData.sizeOrVolume ? "delivery_date" : "dumpster_size",
        missingFields: missing,
        isComplete: false,
      };
    }
    if (!collectedData.sizeOrVolume) {
      const missing = ["sizeOrVolume"];
      if (!collectedData.deliveryDate) missing.push("deliveryDate");
      return {
        currentFunnel: "dumpster_rental",
        currentStep: "dumpster_size",
        nextStep: "delivery_date",
        missingFields: missing,
        isComplete: false,
      };
    }
    if (!collectedData.deliveryDate) {
      return {
        currentFunnel: "dumpster_rental",
        currentStep: "delivery_date",
        nextStep: "checkout",
        missingFields: ["deliveryDate"],
        isComplete: false,
      };
    }
    return {
      currentFunnel: "dumpster_rental",
      currentStep: "checkout",
      nextStep: "booking_complete",
      missingFields: [],
      isComplete: true,
    };
  }

  // 2. Junk Removal Funnel
  if (currentFunnel === "junk_removal") {
    if (!collectedData.projectDescription && !collectedData.itemDescription) {
      return {
        currentFunnel: "junk_removal",
        currentStep: "scope",
        nextStep: "location",
        missingFields: ["projectDescription", "zipCode"],
        isComplete: false,
      };
    }
    if (!collectedData.zipCode) {
      return {
        currentFunnel: "junk_removal",
        currentStep: "location",
        nextStep: "photos",
        missingFields: ["zipCode"],
        isComplete: false,
      };
    }
    if (!collectedData.photos || collectedData.photos.length === 0) {
      return {
        currentFunnel: "junk_removal",
        currentStep: "photos",
        nextStep: "contact_or_checkout",
        missingFields: ["photos"],
        isComplete: false,
      };
    }
    return {
      currentFunnel: "junk_removal",
      currentStep: "contact_or_checkout",
      nextStep: "booking_complete",
      missingFields: [],
      isComplete: true,
    };
  }

  // 3. Tree Service Funnel
  if (currentFunnel === "tree_service") {
    if (!collectedData.projectDescription) {
      return {
        currentFunnel: "tree_service",
        currentStep: "job_description",
        nextStep: "location",
        missingFields: ["projectDescription", "zipCode"],
        isComplete: false,
      };
    }
    if (!collectedData.zipCode) {
      return {
        currentFunnel: "tree_service",
        currentStep: "location",
        nextStep: "photos",
        missingFields: ["zipCode"],
        isComplete: false,
      };
    }
    if (!collectedData.photos || collectedData.photos.length === 0) {
      return {
        currentFunnel: "tree_service",
        currentStep: "photos",
        nextStep: "contact_or_checkout",
        missingFields: ["photos"],
        isComplete: false,
      };
    }
    return {
      currentFunnel: "tree_service",
      currentStep: "contact_or_checkout",
      nextStep: "service_requested",
      missingFields: [],
      isComplete: true,
    };
  }

  // 4. Porta Potty Funnel
  if (currentFunnel === "porta_potty") {
    if (!collectedData.useCase) {
      return {
        currentFunnel: "porta_potty",
        currentStep: "use_case",
        nextStep: "location",
        missingFields: ["useCase", "zipCode"],
        isComplete: false,
      };
    }
    if (!collectedData.zipCode) {
      return {
        currentFunnel: "porta_potty",
        currentStep: "location",
        nextStep: "unit_count",
        missingFields: ["zipCode"],
        isComplete: false,
      };
    }
    if (!collectedData.units) {
      return {
        currentFunnel: "porta_potty",
        currentStep: "unit_count",
        nextStep: "start_date",
        missingFields: ["units"],
        isComplete: false,
      };
    }
    if (!collectedData.deliveryDate) {
      return {
        currentFunnel: "porta_potty",
        currentStep: "start_date",
        nextStep: "duration",
        missingFields: ["deliveryDate"],
        isComplete: false,
      };
    }
    if (!collectedData.duration) {
      return {
        currentFunnel: "porta_potty",
        currentStep: "duration",
        nextStep: "checkout",
        missingFields: ["duration"],
        isComplete: false,
      };
    }
    return {
      currentFunnel: "porta_potty",
      currentStep: "checkout",
      nextStep: "booking_complete",
      missingFields: [],
      isComplete: true,
    };
  }

  // 5. Provider Registration Funnel
  if (currentFunnel === "provider_onboarding") {
    if (!collectedData.servicesOffered && !collectedData.serviceType) {
      return {
        currentFunnel: "provider_onboarding",
        currentStep: "services_offered",
        nextStep: "provider_contact",
        missingFields: ["servicesOffered"],
        isComplete: false,
      };
    }
    if (!collectedData.customerPhone && !collectedData.customerEmail) {
      return {
        currentFunnel: "provider_onboarding",
        currentStep: "provider_contact",
        nextStep: "fleet_specs",
        missingFields: ["customerPhone", "customerEmail"],
        isComplete: false,
      };
    }
    if (!collectedData.fleetCount) {
      return {
        currentFunnel: "provider_onboarding",
        currentStep: "fleet_specs",
        nextStep: "registration_prefill",
        missingFields: ["fleetCount"],
        isComplete: false,
      };
    }
    return {
      currentFunnel: "provider_onboarding",
      currentStep: "registration_prefill",
      nextStep: "registration_complete",
      missingFields: [],
      isComplete: true,
    };
  }

  // 6. Contractor & Professional Funnel
  if (currentFunnel === "contractor_professional") {
    if (!collectedData.businessType) {
      return {
        currentFunnel: "contractor_professional",
        currentStep: "business_type",
        nextStep: "frequency",
        missingFields: ["businessType"],
        isComplete: false,
      };
    }
    if (!collectedData.serviceFrequency) {
      return {
        currentFunnel: "contractor_professional",
        currentStep: "frequency",
        nextStep: "contractor_action",
        missingFields: ["serviceFrequency"],
        isComplete: false,
      };
    }
    return {
      currentFunnel: "contractor_professional",
      currentStep: "contractor_action",
      nextStep: "service_booking",
      missingFields: [],
      isComplete: true,
    };
  }

  // 7. Commercial Builder Funnel
  if (currentFunnel === "commercial_builder") {
    if (!collectedData.companyName && !collectedData.customerPhone) {
      return {
        currentFunnel: "commercial_builder",
        currentStep: "company_profile",
        nextStep: "expected_volume",
        missingFields: ["companyName", "customerPhone"],
        isComplete: false,
      };
    }
    if (!collectedData.expectedVolume) {
      return {
        currentFunnel: "commercial_builder",
        currentStep: "expected_volume",
        nextStep: "commercial_escalation",
        missingFields: ["expectedVolume"],
        isComplete: false,
      };
    }
    return {
      currentFunnel: "commercial_builder",
      currentStep: "commercial_escalation",
      nextStep: "specialist_connected",
      missingFields: [],
      isComplete: true,
    };
  }

  // Default Initial / Welcome State
  return {
    currentFunnel: "initial_intent",
    currentStep: "intent_selection",
    nextStep: "service_selection",
    missingFields: ["serviceType"],
    isComplete: false,
  };
}

/**
 * Generates the active UI Action Card required for the current funnel step
 *
 * @param {string} currentFunnel
 * @param {string} currentStep
 * @param {Object} collectedData
 * @param {string} sessionId
 * @param {Array<Object>} [liveSizes=null]
 * @returns {Object|null} Action Card payload
 */
export function generateStepActionCard(
  currentFunnel,
  currentStep,
  collectedData = {},
  sessionId = "",
  liveSizes = null
) {
  // Step 1: Initial Intent Selection
  if (currentStep === "intent_selection" || currentFunnel === "initial_intent") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "How can BINS APP help you today?",
        options: PRIMARY_INTENT_OPTIONS,
      },
    };
  }

  // Step 2: Service Selection
  if (
    currentStep === "service_selection" ||
    currentFunnel === "service_booking" ||
    (!collectedData.serviceType && collectedData.primaryIntent === "I NEED A SERVICE")
  ) {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "What service do you need?",
        options: SERVICE_SELECTION_OPTIONS,
      },
    };
  }

  // If service was explicitly checked and marked unavailable for this location, present escalation / custom quote card
  if (
    collectedData.serviceable === false &&
    currentStep !== "intent_selection" &&
    currentStep !== "service_selection"
  ) {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: `Service Currently Unavailable in ${collectedData.zipCode || "your area"}`,
        options: [
          { label: "Request Custom Quote", value: "Request a custom partner quote" },
          { label: "Check Another ZIP", value: "Let me check another ZIP code" },
          { label: "Speak to a Specialist", value: "I want to speak with a human specialist" },
        ],
      },
    };
  }

  // Dumpster Sizing Picker Card
  if (currentFunnel === "dumpster_rental" && currentStep === "dumpster_size") {
    // If the area was explicitly checked and marked unavailable, show an escalation card instead of generic sizes
    if (collectedData.serviceable === false) {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: `Dumpsters Currently Unavailable in ${collectedData.zipCode || "your area"}`,
          options: [
            { label: "Request Custom Quote", value: "Request a custom partner quote" },
            { label: "Check Another ZIP", value: "Let me check another ZIP code" },
            { label: "Speak to a Specialist", value: "I want to speak with a human specialist" },
          ],
        },
      };
    }

    // Use strictly the real available sizes for this location if populated
    const sizesToShow =
      Array.isArray(collectedData.availableSizes) && collectedData.availableSizes.length > 0
        ? collectedData.availableSizes
        : (liveSizes || DEFAULT_DUMPSTER_SIZES);

    return {
      cardType: "sizing_picker",
      sessionId,
      payload: {
        title: "Select Recommended Dumpster Size",
        sizes: sizesToShow,
      },
    };
  }

  // Dumpster Delivery Date Card
  if (currentFunnel === "dumpster_rental" && currentStep === "delivery_date") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "When do you need the dumpster delivered?",
        options: [
          { label: "Tomorrow", value: "Tomorrow" },
          { label: "In 2 Days", value: "In 2 days" },
          { label: "This Friday", value: "This Friday" },
          { label: "Next Monday", value: "Next Monday" },
        ],
      },
    };
  }

  // Dumpster Checkout Card
  if (
    currentFunnel === "dumpster_rental" &&
    (currentStep === "checkout" || (collectedData.zipCode && collectedData.sizeOrVolume && collectedData.deliveryDate))
  ) {
    const searchParams = new URLSearchParams();
    if (collectedData.zipCode) searchParams.set("zip", collectedData.zipCode);
    if (collectedData.sizeOrVolume) searchParams.set("size", collectedData.sizeOrVolume);
    if (collectedData.deliveryDate) searchParams.set("date", collectedData.deliveryDate);
    if (collectedData.lat != null && collectedData.lng != null) {
      searchParams.set("lat", collectedData.lat);
      searchParams.set("lng", collectedData.lng);
    }
    searchParams.set("ref_token", `chk_${sessionId}`);

    // Match exact price from real available sizes if available
    let priceToUse = collectedData.estimatedPrice || null;
    if (priceToUse == null && Array.isArray(collectedData.availableSizes)) {
      const selectedLower = String(collectedData.sizeOrVolume || "").toLowerCase();
      const matchedSize = collectedData.availableSizes.find(
        (s) => s.size && s.size.toLowerCase().includes(selectedLower)
      );
      if (matchedSize) {
        priceToUse = matchedSize.startingPrice || matchedSize.threeDaysPrice;
      }
    }

    return {
      cardType: "checkout_link",
      sessionId,
      payload: {
        title: `Book ${collectedData.sizeOrVolume || ""} Dumpster Rental`.trim(),
        checkoutUrl: `${BASE_FRONTEND_URL}/book/dumpster-rental?${searchParams.toString()}`,
        token: `chk_${sessionId}`,
        ref_token: `chk_${sessionId}`,
        summary: {
          serviceType: "Dumbster",
          sizeOrVolume: collectedData.sizeOrVolume,
          zipCode: collectedData.zipCode,
          lat: collectedData.lat || null,
          lng: collectedData.lng || null,
          deliveryDate: collectedData.deliveryDate,
          estimatedPrice: priceToUse,
        },
        buttonText: "Complete Instant Booking",
      },
    };
  }

  // Junk Removal: Scope Selection Card
  if (currentFunnel === "junk_removal" && currentStep === "scope") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "What items do you need removed?",
        options: [
          { label: "Furniture & Appliances", value: "Furniture & Appliances" },
          { label: "Garage / Basement Cleanout", value: "Garage / Basement Cleanout" },
          { label: "Yard Waste & Debris", value: "Yard Waste & Debris" },
          { label: "Construction Debris", value: "Construction Debris" },
          { label: "Full Property Cleanout", value: "Full Property Cleanout" },
          { label: "Single Bulky Item", value: "Single Bulky Item" },
        ],
      },
    };
  }

  // Photos Card for Junk & Tree
  if ((currentFunnel === "junk_removal" || currentFunnel === "tree_service") && currentStep === "photos") {
    return {
      cardType: "media_upload",
      sessionId,
      payload: {
        title: currentFunnel === "tree_service" ? "Upload Tree Service Photos" : "Upload Project Photos",
        description: "Upload up to 5 photos to receive guaranteed, accurate pricing.",
        serviceType: currentFunnel === "tree_service" ? "Tree Removal" : "Junk Removal",
        acceptedFormats: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
          "image/heic-sequence",
          "image/heif-sequence",
          ".heic",
          ".heif",
        ],
        maxFiles: 5,
      },
    };
  }

  // Lead Form for contact capture (Junk & Tree completion)
  if ((currentFunnel === "junk_removal" || currentFunnel === "tree_service") && currentStep === "contact_or_checkout") {
    return {
      cardType: "lead_form",
      sessionId,
      payload: {
        title: "Contact Details for Fast Quote & Booking",
        fields: ["name", "phone", "email", "zipCode"],
      },
    };
  }

  // Tree Service: Job Description Card
  if (currentFunnel === "tree_service" && currentStep === "job_description") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "What tree service do you need?",
        options: [
          { label: "Tree Removal", value: "Tree Removal" },
          { label: "Tree Trimming & Pruning", value: "Tree Trimming & Pruning" },
          { label: "Stump Grinding", value: "Stump Grinding" },
          { label: "Emergency Storm Damage", value: "Emergency Storm Damage" },
        ],
      },
    };
  }

  // Porta Potty: Use Case Card
  if (currentFunnel === "porta_potty" && currentStep === "use_case") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "What is the porta potty for?",
        options: [
          { label: "Construction Jobsite", value: "Construction Jobsite" },
          { label: "Special Event / Wedding", value: "Special Event" },
          { label: "Commercial / Industrial", value: "Commercial / Industrial" },
          { label: "Home Renovation", value: "Home Renovation" },
        ],
      },
    };
  }

  // Porta Potty: Unit Count Card
  if (currentFunnel === "porta_potty" && currentStep === "unit_count") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "How many units do you need?",
        options: [
          { label: "1 Standard Unit", value: "1 Standard Unit" },
          { label: "2-4 Units", value: "2-4 Units" },
          { label: "5-10 Units", value: "5-10 Units" },
          { label: "10+ Units (Large Site)", value: "10+ Units (Large Site)" },
        ],
      },
    };
  }

  // Porta Potty: Duration Card
  if (currentFunnel === "porta_potty" && currentStep === "duration") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "How long will you need the unit?",
        options: [
          { label: "Weekend (1-3 Days)", value: "Weekend (1-3 Days)" },
          { label: "1-2 Weeks", value: "1-2 Weeks" },
          { label: "1 Month", value: "1 Month" },
          { label: "Multi-Month / Ongoing", value: "Multi-Month / Ongoing" },
        ],
      },
    };
  }

  // Porta Potty: Checkout Card
  if (currentFunnel === "porta_potty" && currentStep === "checkout") {
    const searchParams = new URLSearchParams();
    if (collectedData.zipCode) searchParams.set("zip", collectedData.zipCode);
    if (collectedData.deliveryDate) searchParams.set("date", collectedData.deliveryDate);
    searchParams.set("ref_token", `chk_${sessionId}`);

    return {
      cardType: "checkout_link",
      sessionId,
      payload: {
        title: "Book Portable Restrooms",
        checkoutUrl: `${BASE_FRONTEND_URL}/book/porta-potty?${searchParams.toString()}`,
        token: `chk_${sessionId}`,
        ref_token: `chk_${sessionId}`,
        summary: {
          serviceType: "Porta Potty",
          useCase: collectedData.useCase,
          units: collectedData.units,
          duration: collectedData.duration,
          zipCode: collectedData.zipCode,
          deliveryDate: collectedData.deliveryDate,
        },
        buttonText: "Complete Instant Booking",
      },
    };
  }

  // Provider Onboarding Cards
  if (currentFunnel === "provider_onboarding") {
    if (currentStep === "services_offered") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "What services does your fleet provide?",
          options: SERVICE_SELECTION_OPTIONS,
        },
      };
    }
    if (currentStep === "provider_contact") {
      return {
        cardType: "lead_form",
        sessionId,
        payload: {
          title: "Join BinsApp Operator Network",
          description: "FREE TO REGISTER • FREE TO RECEIVE ELIGIBLE JOB ALERTS • NO MONTHLY SUBSCRIPTION REQUIRED",
          fields: ["companyName", "contactName", "phone", "email", "zipCode"],
        },
      };
    }
    if (currentStep === "fleet_specs") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "Fleet Capacity & Equipment",
          options: [
            { label: "1-3 Roll-Off Dumpsters", value: "1-3 Dumpsters" },
            { label: "4-10 Roll-Off Dumpsters", value: "4-10 Dumpsters" },
            { label: "10+ Dumpsters (High-Volume Fleet)", value: "10+ Dumpsters" },
          ],
        },
      };
    }
    if (currentStep === "registration_prefill") {
      return {
        cardType: "checkout_link",
        sessionId,
        payload: {
          title: "Complete Free Provider Registration",
          checkoutUrl: `${BASE_FRONTEND_URL}/provider/register?phone=${collectedData.customerPhone || ""}&email=${collectedData.customerEmail || ""}`,
          token: `prov_${sessionId}`,
          buttonText: "Complete Free Registration",
        },
      };
    }
  }

  // Contractor Cards
  if (currentFunnel === "contractor_professional") {
    if (currentStep === "business_type") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "What is your trade business?",
          options: [
            { label: "General Contractor", value: "General Contractor" },
            { label: "Roofing Contractor", value: "Roofing Contractor" },
            { label: "Remodeling / Builder", value: "Remodeling" },
            { label: "Demolition / Landscaping", value: "Demolition" },
            { label: "Property Manager", value: "Property Manager" },
          ],
        },
      };
    }
    if (currentStep === "frequency") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "How often do you need site services?",
          options: [
            { label: "One-Off Project", value: "One-off" },
            { label: "Weekly / Bi-Weekly", value: "Weekly" },
            { label: "Monthly Recurring", value: "Monthly" },
            { label: "Multi-Jobsite Recurring", value: "Multi-Jobsite Volume" },
          ],
        },
      };
    }
    if (currentStep === "contractor_action") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "Next Step for Trade Professionals",
          options: [
            { label: "Book A Service Now", value: "Book A Service Now" },
            { label: "Create Trade Account", value: "Create Trade Account" },
            { label: "Talk To Commercial Desk", value: "Talk To Commercial Desk" },
          ],
        },
      };
    }
  }

  // Commercial / Builder Cards
  if (currentFunnel === "commercial_builder") {
    if (currentStep === "company_profile") {
      return {
        cardType: "lead_form",
        sessionId,
        payload: {
          title: "Commercial & Builder Account Onboarding",
          description: "Dedicated account manager, volume trade rates & priority bin swaps.",
          fields: ["companyName", "contactName", "phone", "email"],
        },
      };
    }
    if (currentStep === "expected_volume") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "Estimated Monthly Waste Volume",
          options: [
            { label: "1-5 Bins / Month", value: "1-5 Bins" },
            { label: "5-15 Bins / Month", value: "5-15 Bins" },
            { label: "15+ Bins / Month (Enterprise)", value: "15+ Bins" },
          ],
        },
      };
    }
    if (currentStep === "commercial_escalation") {
      return {
        cardType: "lead_form",
        sessionId,
        payload: {
          title: "Connect with Commercial Desk",
          description: "Our dedicated trade account executive will reach out shortly.",
          fields: ["contactName", "phone", "companyName"],
        },
      };
    }
  }

  return null;
}

/**
 * Persists and updates session funnel state in Redis
 *
 * @param {string} sessionId
 * @param {Object} stateUpdates
 * @returns {Promise<Object>} Updated full state
 */
export async function updateSessionFunnelState(sessionId, stateUpdates = {}) {
  if (!sessionId) return {};

  const key = `${FUNNEL_KEY_PREFIX}${sessionId}:funnel_state`;
  let existing = {};

  try {
    const raw = await redis.get(key);
    if (raw) existing = JSON.parse(raw);
  } catch (err) {
    logger.warn(`Error reading funnel state for ${sessionId}:`, err?.message);
  }

  const mergedCollectedData = {
    ...(existing.collectedData || {}),
    ...(stateUpdates.collectedData || {}),
  };

  const currentFunnel = stateUpdates.currentFunnel || existing.currentFunnel || "initial_intent";
  const stepInfo = calculateFunnelStep(currentFunnel, mergedCollectedData);

  const fullState = {
    currentFunnel: stepInfo.currentFunnel,
    currentStep: stepInfo.currentStep,
    nextStep: stepInfo.nextStep,
    missingFields: stepInfo.missingFields,
    collectedData: mergedCollectedData,
    lastUpdated: new Date().toISOString(),
  };

  try {
    await redis.set(key, JSON.stringify(fullState), "EX", FUNNEL_STATE_TTL_SECONDS);
  } catch (err) {
    logger.error(`Error saving funnel state to Redis for ${sessionId}:`, err);
  }

  return fullState;
}

/**
 * Retrieves the persisted funnel state for a session
 *
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
export async function getSessionFunnelState(sessionId) {
  if (!sessionId) {
    return calculateFunnelStep("initial_intent", {});
  }

  const key = `${FUNNEL_KEY_PREFIX}${sessionId}:funnel_state`;
  try {
    const raw = await redis.get(key);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    logger.warn(`Error fetching funnel state for ${sessionId}:`, err?.message);
  }

  return calculateFunnelStep("initial_intent", {});
}

export default {
  extractEntitiesFromMessage,
  calculateFunnelStep,
  generateStepActionCard,
  updateSessionFunnelState,
  getSessionFunnelState,
  getLiveDumpsterSizes,
  normalizeDate,
  PRIMARY_INTENT_OPTIONS,
  SERVICE_SELECTION_OPTIONS,
  DEFAULT_DUMPSTER_SIZES,
};
