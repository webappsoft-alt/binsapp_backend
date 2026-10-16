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

export const PROVIDER_SERVICE_OPTIONS = [
  { label: "Dumpster Rentals", value: "Dumpster Rentals" },
  { label: "Junk Removal", value: "Junk Removal" },
  { label: "Tree Services", value: "Tree Services" },
  { label: "Portable Sanitation", value: "Portable Sanitation" },
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

export function normalizeDumpsterDimensions(sizeStr, rawDim) {
  const s = String(sizeStr || '').toLowerCase();
  const raw = String(rawDim || '').trim();
  if (raw && !/^\d+x\d+(\s*ft)?$/i.test(raw) && (raw.includes('L') || raw.includes('W') || raw.includes('H'))) {
    return raw.includes('ft') ? raw : `${raw} ft`;
  }
  if (s.includes('6') || s.includes('8')) return '~10ft L × 6ft W × 3ft H';
  if (s.includes('10') || s.includes('12')) return '14ft L × 7.5ft W × 3.5ft H';
  if (s.includes('14') || s.includes('15') || s.includes('16')) return '16ft L × 7.5ft W × 4.5ft H';
  if (s.includes('20') || s.includes('18')) return '22ft L × 8ft W × 4.5ft H';
  if (s.includes('30')) return '22ft L × 8ft W × 6ft H';
  if (s.includes('40')) return '22ft L × 8ft W × 8ft H';
  return raw ? `${raw} ft` : 'Standard Dimensions';
}

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
          dimensions: normalizeDumpsterDimensions(displaySize, item.dimension),
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
export function normalizeDate(text, options = {}) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase().trim();

  // If text contains an explicit ISO date YYYY-MM-DD anywhere, e.g. "Tomorrow (2026-10-14)" or "2026-10-14"
  const isoMatch = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(isoMatch[2]).padStart(2, "0");
    const d = String(isoMatch[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Derive reference date anchor (local noon) to avoid any UTC day shift
  let baseDate;
  if (options.clientLocalDate && /^\d{4}-\d{2}-\d{2}$/.test(options.clientLocalDate)) {
    const [y, m, d] = options.clientLocalDate.split("-").map(Number);
    baseDate = new Date(y, m - 1, d, 12, 0, 0);
  } else if (options.clientTimestamp) {
    const parsed = new Date(options.clientTimestamp);
    baseDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    baseDate = new Date();
  }
  const currentYear = baseDate.getFullYear();

  const toIsoString = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // 1. Today / Now / ASAP
  if (/\b(today|now|asap)\b/i.test(lower)) {
    return toIsoString(baseDate);
  }

  // 2. Tomorrow
  if (/\btomorrow\b/i.test(lower)) {
    const target = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1, 12, 0, 0);
    return toIsoString(target);
  }

  // 3. In X days / in a week
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) {
    const daysToAdd = parseInt(inDaysMatch[1], 10);
    const target = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + daysToAdd, 12, 0, 0);
    return toIsoString(target);
  }
  if (/\bin\s+(?:a|1)\s+week\b/i.test(lower)) {
    const target = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 7, 12, 0, 0);
    return toIsoString(target);
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
      const currentDay = baseDate.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      if (modifier === "next" && diff < 7) {
        diff += 7;
      }
      const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + diff, 12, 0, 0);
      return toIsoString(targetDate);
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

export function isQuestionOrInquiry(text = "") {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  const lower = t.toLowerCase();
  return (
    t.includes("?") ||
    /\b(do you|can you|could you|what about|how about|is .* available|do you guys|are there|tell me about|how much|how many|what is|what are|who is|who serves|where do|why do|can i|could you|does it|how does|what does)\b/i.test(t) ||
    /\b(nearby|near me|in my area|close to me|who serves|providers nearby|available nearby)\b/i.test(t) ||
    lower.startsWith("how ") ||
    lower.startsWith("what ") ||
    lower.startsWith("why ") ||
    lower.startsWith("when ") ||
    lower.startsWith("where ") ||
    lower.startsWith("who ") ||
    lower.startsWith("can ") ||
    lower.startsWith("could ") ||
    lower.startsWith("do ") ||
    lower.startsWith("does ") ||
    lower.startsWith("is ") ||
    lower.startsWith("are ")
  );
}

/**
 * Extracts multiple structured fields from a single natural language user message
 *
 * @param {string} text - User message
 * @param {Object} [existingData={}] - Already collected fields
 * @param {Object} [options={}] - Context metadata including clientLocalDate, clientTimezone
 * @returns {Object} Newly extracted and updated fields
 */
export function extractEntitiesFromMessage(text = "", existingData = {}, options = {}) {
  if (!text || typeof text !== "string") return { ...existingData };

  // Strip URLs before analyzing text for keywords so photo bucket URLs (e.g. storage.googleapis.com/dumpster-df2b0...) don't trigger dumpster keywords!
  const textWithoutUrls = text.replace(/https?:\/\/[^\s]+/gi, " ").trim();
  const lower = textWithoutUrls.toLowerCase();
  const extracted = { ...existingData };

  // 1. Primary Intent Detection (Allows explicit intent switches)
  const hasExplicitContractor =
    /\b(i'?m a contractor|i am a contractor|i'?m a professional|i am a professional|trade account|contractor account|contractor intake)\b/i.test(textWithoutUrls) ||
    textWithoutUrls.trim().toUpperCase() === "I’M A CONTRACTOR / PROFESSIONAL" ||
    textWithoutUrls.trim().toUpperCase() === "I'M A CONTRACTOR / PROFESSIONAL";
  const hasExplicitProvider =
    lower.includes("join as a provider") ||
    lower.includes("become a vendor") ||
    lower.includes("hauler registration") ||
    lower.includes("operator partner") ||
    lower.includes("join as provider") ||
    lower.includes("provider partner");
  const hasExplicitCommercial = /\b(commercial customer|commercial account|multi-location)\b/i.test(textWithoutUrls) || (/\bbuilder\b/i.test(textWithoutUrls) && !textWithoutUrls.includes("@"));
  const isGenericServiceRequest =
    /\b(i\s+need\s+a\s+service|need\s+a\s+service|i\s+need\s+service|need\s+service|book\s+a\s+service|choose\s+a\s+service|select\s+a\s+service|show\s+services|what\s+services|different\s+service|switch\s+service|change\s+service|other\s+service)\b/i.test(textWithoutUrls) ||
    textWithoutUrls.trim().toLowerCase() === "i need a service" ||
    textWithoutUrls.trim().toLowerCase() === "need a service" ||
    textWithoutUrls.trim().toLowerCase() === "services" ||
    textWithoutUrls.trim().toLowerCase() === "start over" ||
    textWithoutUrls.trim().toLowerCase() === "reset";

  const isProviderActive =
    extracted.primaryIntent === "I WANT TO JOIN AS A PROVIDER" ||
    existingData.primaryIntent === "I WANT TO JOIN AS A PROVIDER";

  const hasExplicitService =
    !isProviderActive &&
    (isGenericServiceRequest ||
      lower.includes("dumpster") ||
      lower.includes("dumbster") ||
      lower.includes("roll-off") ||
      lower.includes("roll off") ||
      lower.includes("junk") ||
      lower.includes("tree") ||
      lower.includes("porta"));
  const hasExplicitQuestion = lower.includes("have a question") || lower.includes("faq") || lower.includes("how does it work");

  const hasExplicitIntent = hasExplicitContractor || hasExplicitProvider || hasExplicitCommercial || hasExplicitService || hasExplicitQuestion;

  if (!extracted.primaryIntent || hasExplicitIntent || lower.includes("switch to") || lower.includes("instead")) {
    if (hasExplicitContractor) {
      if (extracted.primaryIntent !== "I’M A CONTRACTOR / PROFESSIONAL") {
        extracted.primaryIntent = "I’M A CONTRACTOR / PROFESSIONAL";
        delete extracted.serviceType;
        delete extracted.contractorAction;
      }
    } else if (hasExplicitProvider) {
      extracted.primaryIntent = "I WANT TO JOIN AS A PROVIDER";
      delete extracted.serviceType;
      // Purge previous rentee/customer data so customer pricing does not leak into provider partner registration
      delete extracted.sizeOrVolume;
      delete extracted.availableSizes;
      delete extracted.dumpsterSize;
      delete extracted.threeDaysPrice;
      delete extracted.sevenDaysPrice;
      delete extracted.quote;
      delete extracted.estimatedPrice;
      delete extracted.junkAnalysis;
      delete extracted.treeAnalysis;
      delete extracted.treeNeed;
      delete extracted.treeUrgency;
      delete extracted.checkoutInitiated;
      delete extracted.deliveryDate;
      delete extracted.bookingComplete;
    } else if (hasExplicitCommercial) {
      extracted.primaryIntent = "I’M A BUILDER / COMMERCIAL CUSTOMER";
      delete extracted.serviceType;
    } else if (hasExplicitService) {
      extracted.primaryIntent = "I NEED A SERVICE";
      if (isGenericServiceRequest) {
        delete extracted.serviceType;
        delete extracted.sizeOrVolume;
        delete extracted.availableSizes;
        delete extracted.dumpsterSize;
        delete extracted.threeDaysPrice;
        delete extracted.sevenDaysPrice;
        delete extracted.quote;
        delete extracted.estimatedPrice;
        delete extracted.junkAnalysis;
        delete extracted.treeAnalysis;
        delete extracted.junkVolume;
        delete extracted.treeNeed;
        delete extracted.treeUrgency;
        delete extracted.checkoutInitiated;
        delete extracted.deliveryDate;
        delete extracted.bookingComplete;
        delete extracted.contractorAction;
        delete extracted.photos;
        delete extracted.photosSkipped;
        extracted.resetService = true;
      }
    } else if (hasExplicitQuestion) {
      extracted.primaryIntent = "I HAVE A QUESTION";
    }
  }

  // 2. Service Type Detection (Use word boundaries on clean text without URLs to avoid bucket domain collisions)
  const isProviderIntentActive =
    extracted.primaryIntent === "I WANT TO JOIN AS A PROVIDER" ||
    existingData.primaryIntent === "I WANT TO JOIN AS A PROVIDER";

  if (isProviderIntentActive) {
    if (/\b(dumpster|dumpsters|roll-off|roll-offs|roll off|bins?)\b/i.test(textWithoutUrls)) {
      extracted.servicesOffered = ["Dumpster Rentals"];
      extracted.providerService = "Dumpster Rentals";
      extracted.serviceType = "Dumpster Rental";
    } else if (/\b(junk|cleanout|clean out|trash|haul away)\b/i.test(textWithoutUrls)) {
      extracted.servicesOffered = ["Junk Removal"];
      extracted.providerService = "Junk Removal";
      extracted.serviceType = "Junk Removal";
    } else if (/\b(tree|trees|arborist|stump|trimming)\b/i.test(textWithoutUrls)) {
      extracted.servicesOffered = ["Tree Services"];
      extracted.providerService = "Tree Services";
      extracted.serviceType = "Tree Removal";
    } else if (/\b(porta|potty|potties|restroom|sanitation)\b/i.test(textWithoutUrls)) {
      extracted.servicesOffered = ["Portable Sanitation"];
      extracted.providerService = "Portable Sanitation";
      extracted.serviceType = "Porta Potty";
    }
  } else {
    const previousService = extracted.serviceType;
    if (extracted.resetService) {
      delete extracted.serviceType;
      delete extracted.inquiredService;
    } else {
      // Check if message is a general question or inquiry about another service (e.g. "Do you also do junk removal?", "What about tree trimming?")
      const isQuestionOrInquiry =
        /\b(do you (also |offer |have |do |provide )|can you (also |help with )|what about |how about |is .* available|do you guys (do|have)|are there |tell me about )\b/i.test(textWithoutUrls) ||
        textWithoutUrls.includes("?") ||
        /\b(also do|also offer|also have|also provide)\b/i.test(textWithoutUrls);

      let detectedNewService = null;
      if (/\b(tree|trees|stump|stumps|arborist|limb|limbs|branch|branches|fallen tree)\b/i.test(textWithoutUrls)) {
        detectedNewService = "Tree Removal";
      } else if (/\b(junk|haul away|cleanout|clean out|trash removal|debris removal|bulk trash|furniture removal)\b/i.test(textWithoutUrls)) {
        detectedNewService = "Junk Removal";
      } else if (/\b(porta|potty|potties|restroom|restrooms|portable toilet|porta-potty)\b/i.test(textWithoutUrls)) {
        detectedNewService = "Porta Potty";
      } else if (/\b(dumpster|dumpsters|dumbster|dumbsters|roll-off|roll-offs|roll off|roll offs)\b/i.test(textWithoutUrls)) {
        detectedNewService = "Dumbster";
      }

      if (detectedNewService) {
        if (isQuestionOrInquiry && previousService && detectedNewService !== previousService) {
          // User is asking a question about another service while in the middle of a booking!
          // DO NOT wipe or reset their active booking — record inquiry for contextual guidance
          extracted.inquiredService = detectedNewService;
          extracted.serviceType = previousService;
        } else {
          extracted.serviceType = detectedNewService;
          delete extracted.inquiredService;
        }
      }
    }

    // When explicitly switching service types, purge previous service-specific fields
    if (extracted.serviceType && previousService && extracted.serviceType !== previousService) {
      if (extracted.serviceType !== "Dumbster") {
        delete extracted.sizeOrVolume;
        delete extracted.availableSizes;
        delete extracted.dumpsterSize;
        delete extracted.threeDaysPrice;
        delete extracted.sevenDaysPrice;
      }
      if (extracted.serviceType !== "Junk Removal") {
        delete extracted.junkVolume;
      }
      if (extracted.serviceType !== "Tree Removal") {
        delete extracted.treeNeed;
        delete extracted.treeUrgency;
        delete extracted.jobDescription;
      }
      delete extracted.deliveryDate;
      delete extracted.photos;
      delete extracted.photosProvided;
      delete extracted.photosSkipped;
      delete extracted.checkoutInitiated;
      delete extracted.junkAnalysis;
      delete extracted.treeAnalysis;
      delete extracted.estimatedPrice;
    }
  }

  // 3. Dumpster Size / Volume (Only for Dumpster rental)
  if (extracted.serviceType === "Dumbster" || (!extracted.serviceType && /\b(yard|yd|yards|yds)\b/i.test(textWithoutUrls))) {
    const sizeMatch = textWithoutUrls.match(/\b(10|12|15|20|30|40)\s*(?:yard|yd|yards|yds)\b/i);
    if (sizeMatch) {
      extracted.sizeOrVolume = `${sizeMatch[1]} Yard`;
      if (!extracted.serviceType) extracted.serviceType = "Dumbster";
    }
  }

  // 4. Address & US 5-Digit ZIP Code (Enhanced for Google Places full address strings & street patterns)
  const addressPrefixMatch = textWithoutUrls.match(/(?:jobsite location|delivery address|service address|jobsite address|delivery location|property address|address)\s*[:=\-]\s*([^;\n]+)/i);
  if (addressPrefixMatch) {
    const rawAddr = addressPrefixMatch[1].trim();
    if (rawAddr.length > 3) {
      extracted.address = rawAddr;
      extracted.deliveryAddress = rawAddr;
    }
  } else {
    // Detect standard US street address pattern (e.g., "123 Main St, Austin, TX 78701" or "4500 Airport Blvd")
    const streetAddressMatch = textWithoutUrls.match(/\b\d{1,6}\s+[A-Za-z0-9\s.,#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Highway|Hwy|Place|Pl|Trail|Trl|Parkway|Pkwy)\b(?:[,\s]+[A-Za-z\s]+(?:,\s*[A-Z]{2})?(?:\s*\d{5})?)?/i);
    if (streetAddressMatch && streetAddressMatch[0].length >= 8) {
      extracted.address = streetAddressMatch[0].trim();
      extracted.deliveryAddress = extracted.address;
    }
  }

  const zipMatch = textWithoutUrls.match(/\b\d{5}\b/);
  if (zipMatch) {
    extracted.zipCode = zipMatch[0];
    extracted.baseZip = zipMatch[0];
  }

  // Search Radius Extraction (e.g. "within 25 miles", "30 mile radius", "50 miles")
  const radiusMatch = textWithoutUrls.match(/\b(?:within|radius of|in a|around)?\s*(\d+)\s*(?:\+?\s*)?(?:miles?|mi)\b/i);
  if (radiusMatch && !isProviderActive) {
    extracted.preferredRadius = Number(radiusMatch[1]);
  }

  // 5. Junk Removal Volume Extraction (e.g., 1/4 Truckload, 1/2 Truckload, Full Truckload)
  if (extracted.serviceType === "Junk Removal" || lower.includes("truckload") || lower.includes("truck load")) {
    if (/\b(1\/4|quarter|one quarter)\s*(?:truck|truckload|load)?\b/i.test(textWithoutUrls)) {
      extracted.junkVolume = "1/4 Truckload";
      extracted.sizeOrVolume = "1/4 Truckload";
    } else if (/\b(1\/2|half|one half)\s*(?:truck|truckload|load)?\b/i.test(textWithoutUrls)) {
      extracted.junkVolume = "1/2 Truckload";
      extracted.sizeOrVolume = "1/2 Truckload";
    } else if (/\b(multiple|multi|several|2|3|4)\s*(?:trucks?|truckloads?|loads?)\b/i.test(textWithoutUrls)) {
      extracted.junkVolume = "Multiple Truckloads";
      extracted.sizeOrVolume = "Multiple Truckloads";
    } else if (/\b(full|whole|1|one)\s*(?:truck|truckload|load)\b/i.test(textWithoutUrls)) {
      extracted.junkVolume = "Full Truckload";
      extracted.sizeOrVolume = "Full Truckload";
    } else if (/\b(single|one|1)\s*(?:item|bulky item|piece)\b/i.test(textWithoutUrls)) {
      extracted.junkVolume = "Single Bulky Item";
      extracted.sizeOrVolume = "Single Bulky Item";
    }
  }

  // 6. Tree Service Need Options Detection (Exact client options: Tree removal, Fallen tree, Storm cleanup, Tree trimming, Property cleanup, Other)
  if (extracted.serviceType === "Tree Removal" || lower.includes("tree") || lower.includes("branch") || lower.includes("storm")) {
    if (/\b(tree fell|fallen tree|tree has fallen|fell in|tree fallen)\b/i.test(textWithoutUrls)) {
      extracted.treeNeed = "Fallen tree";
      if (!extracted.jobDescription) extracted.jobDescription = "Fallen tree";
    } else if (/\b(storm cleanup|storm damage|after a storm|storm)\b/i.test(textWithoutUrls)) {
      extracted.treeNeed = extracted.treeNeed || "Storm cleanup";
    } else if (/\b(tree trimming|trimming|pruning|trim tree|cut branches|prune)\b/i.test(textWithoutUrls)) {
      extracted.treeNeed = "Tree trimming";
    } else if (/\b(property cleanup|lot clearing|brush clearing|brush removal|yard clearing)\b/i.test(textWithoutUrls)) {
      extracted.treeNeed = "Property cleanup";
    } else if (/\b(tree removal|remove tree|cut down|take down tree)\b/i.test(textWithoutUrls)) {
      extracted.treeNeed = "Tree removal";
    } else if (lower.includes("other tree") || lower === "other") {
      extracted.treeNeed = "Other";
    }

    // Tree Urgency Detection
    if (/\b(emergency|hazard|immediate|power lines?|on roof|danger|dangerous)\b/i.test(textWithoutUrls)) {
      extracted.treeUrgency = "Emergency / Hazard";
    } else if (/\b(24-48|24 to 48|24 hours|48 hours|within 2 days|asap)\b/i.test(textWithoutUrls)) {
      extracted.treeUrgency = "Within 24-48 Hours";
    } else if (/\b(this week|few days|in a week)\b/i.test(textWithoutUrls)) {
      extracted.treeUrgency = "This Week";
    } else if (/\b(flexible|non-urgent|no rush|whenever)\b/i.test(textWithoutUrls)) {
      extracted.treeUrgency = "Flexible";
    }

    // Tree Job Description / Location Details
    if (lower.includes("backyard") || lower.includes("back yard")) {
      extracted.jobDescription = extracted.jobDescription ? `${extracted.jobDescription} in backyard` : "Backyard";
    }
    if (lower.includes("front yard") || lower.includes("frontyard")) {
      extracted.jobDescription = extracted.jobDescription ? `${extracted.jobDescription} in front yard` : "Front yard";
    }
    if (lower.includes("power line") || lower.includes("wires")) {
      extracted.jobDescription = extracted.jobDescription ? `${extracted.jobDescription} (near power lines)` : "Near power lines";
    }
    if (lower.includes("roof") || lower.includes("house") || lower.includes("fence")) {
      extracted.jobDescription = extracted.jobDescription ? `${extracted.jobDescription} (near structure/roof)` : "Near roof/structure";
    }
  }

  // 7. Project Description / Project Type (Dumpster, Junk, Tree)
  if (lower.includes("roof") || lower.includes("shingle")) {
    extracted.projectType = "Roofing";
    extracted.projectDescription = extracted.projectDescription || "Roof replacement";
  } else if (lower.includes("spring clean") || lower.includes("garage clean") || lower.includes("basement clean") || lower.includes("declutter")) {
    extracted.projectType = "Spring Cleaning";
    extracted.projectDescription = extracted.projectDescription || "Garage / Basement Cleanout";
  } else if (lower.includes("remodel") || lower.includes("renovat") || lower.includes("kitchen") || lower.includes("bathroom")) {
    extracted.projectType = "Remodeling";
    extracted.projectDescription = extracted.projectDescription || "Remodeling project";
  } else if (lower.includes("construct") || lower.includes("addition") || lower.includes("new build")) {
    extracted.projectType = "Construction";
    extracted.projectDescription = extracted.projectDescription || "Construction Debris";
  } else if (lower.includes("furniture") || lower.includes("appliance") || lower.includes("couch") || lower.includes("mattress")) {
    extracted.projectDescription = extracted.projectDescription || "Furniture & Appliances";
  } else if (lower.includes("yard") || lower.includes("brush") || lower.includes("landscap")) {
    extracted.projectType = "Yard Debris";
    extracted.projectDescription = extracted.projectDescription || "Yard Waste & Debris";
  } else if (lower.includes("estate cleanout") || lower.includes("whole house") || lower.includes("property cleanout") || lower.includes("old house")) {
    extracted.projectDescription = extracted.projectDescription || "Old house / Estate cleanout";
  } else if (lower.includes("single item") || lower.includes("bulky item")) {
    extracted.projectDescription = extracted.projectDescription || "Single Bulky Item";
  }

  // Contractor Business Type & Frequency
  if (lower.includes("general contractor")) extracted.businessType = "General Contractor";
  if (lower.includes("roofer") || lower.includes("roofing contractor")) extracted.businessType = "Roofing Contractor";
  if (lower.includes("remodel") || lower.includes("builder")) extracted.businessType = "Remodeling";
  if (lower.includes("demolition")) extracted.businessType = "Demolition";
  if (lower.includes("property manager")) extracted.businessType = "Property Manager";

  if (lower.includes("weekly") || lower.includes("recurring") || lower.includes("every week") || lower.includes("bi-weekly")) extracted.serviceFrequency = "Weekly";
  if (lower.includes("monthly")) extracted.serviceFrequency = "Monthly";
  if (lower.includes("one off") || lower.includes("one-off") || lower.includes("just this job")) extracted.serviceFrequency = "One-off";
  if (lower.includes("multi-jobsite") || lower.includes("multi jobsite")) extracted.serviceFrequency = "Multi-Jobsite Volume";

  // Contractor Action Selection
  if (
    lower.includes("create trade account") ||
    lower.includes("trade account") ||
    lower.includes("create account") ||
    lower.includes("open trade") ||
    lower.includes("open account") ||
    lower.includes("sign up for trade") ||
    lower.includes("trade registration")
  ) {
    extracted.contractorAction = "trade_account";
  } else if (
    lower.includes("book a service now") ||
    lower.includes("book a service") ||
    lower.includes("book service") ||
    lower.includes("book now") ||
    lower.includes("order a dumpster") ||
    lower.includes("order dumpster")
  ) {
    extracted.contractorAction = "book_service";
    if (!extracted.serviceType) {
      extracted.serviceType = "Dumbster";
    }
  } else if (
    lower.includes("commercial desk") ||
    lower.includes("talk to commercial") ||
    lower.includes("commercial support") ||
    lower.includes("speak to commercial")
  ) {
    extracted.contractorAction = "commercial_desk";
  }

  // Provider details & fleet specifications
  // isProviderActive is already computed at top of function

  // Company Name & Contact / Owner Name extraction
  const companyMatch = textWithoutUrls.match(/(?:company|business)(?:\s*name)?\s*[:=\-]\s*([^,\n;]+)/i);
  if (companyMatch) extracted.companyName = companyMatch[1].trim();

  const contactMatch = textWithoutUrls.match(/(?:contact|owner|name)(?:\s*person|\s*name)?\s*[:=\-]\s*([^,\n;]+)/i);
  if (contactMatch) {
    extracted.contactName = contactMatch[1].trim();
    extracted.ownerName = contactMatch[1].trim();
  }

  // Dumpster / Fleet count (e.g., "4-10 Dumpsters", "1-5", "10+", "15 roll-offs", "8 trucks")
  const qtyMatch = textWithoutUrls.match(/(\d+(?:\s*[-–to]\s*\d+)?|\d+\+?)\s*(?:roll-offs?|dumpsters?|bins?|containers?|trucks?|fleet)/i);
  if (qtyMatch) {
    const val = qtyMatch[1].trim();
    extracted.dumpsterQuantity = val;
    extracted.fleetCount = val;
    extracted.dumpsterCount = val;
  } else if (/\b(1-5|6-15|16-30|30\+|1-3|4-10|10\+)\s*(?:dumpsters?|trucks?|roll-offs?)/i.test(textWithoutUrls)) {
    const m = textWithoutUrls.match(/\b(1-5|6-15|16-30|30\+|1-3|4-10|10\+)\s*(?:dumpsters?|trucks?|roll-offs?)/i);
    extracted.dumpsterQuantity = m[1];
    extracted.fleetCount = m[1];
    extracted.dumpsterCount = m[1];
  } else if (isProviderActive && (lower.includes("truck") || lower.includes("fleet"))) {
    const truckMatch = textWithoutUrls.match(/(\d+)\s*(?:trucks?|fleet|haulers?)/i);
    if (truckMatch) {
      extracted.fleetCount = truckMatch[1];
      extracted.dumpsterQuantity = truckMatch[1];
    }
  }

  // Dumpster sizes (10, 15, 20, 30, 40 yard)
  if (isProviderActive || lower.includes("size") || lower.includes("yard")) {
    const extractedSizes = [];
    if (/\b10\b/i.test(textWithoutUrls) && (lower.includes("yard") || lower.includes("size") || lower.includes("yd"))) extractedSizes.push("10 yard");
    if (/\b15\b/i.test(textWithoutUrls) && (lower.includes("yard") || lower.includes("size") || lower.includes("yd"))) extractedSizes.push("15 yard");
    if (/\b20\b/i.test(textWithoutUrls) && (lower.includes("yard") || lower.includes("size") || lower.includes("yd"))) extractedSizes.push("20 yard");
    if (/\b30\b/i.test(textWithoutUrls) && (lower.includes("yard") || lower.includes("size") || lower.includes("yd"))) extractedSizes.push("30 yard");
    if (/\b40\b/i.test(textWithoutUrls) && (lower.includes("yard") || lower.includes("size") || lower.includes("yd"))) extractedSizes.push("40 yard");
    if (lower.includes("all sizes") || lower.includes("all dimensions")) {
      extractedSizes.push("10 yard", "15 yard", "20 yard", "30 yard", "40 yard");
    }
    if (lower.includes("trailer") || lower.includes("rubber-wheeled")) {
      extractedSizes.push("Dump trailer");
    }
    if (extractedSizes.length > 0) {
      extracted.dumpsterSizes = Array.from(new Set([...(extracted.dumpsterSizes || []), ...extractedSizes]));
    }
  }

  // Truck / System type
  if (isProviderActive || lower.includes("truck") || lower.includes("lift") || lower.includes("system") || lower.includes("trailer")) {
    if (lower.includes("both") || (lower.includes("roll") && lower.includes("trailer"))) {
      extracted.truckType = "Both";
    } else if (lower.includes("dump trailer") || (lower.includes("trailer") && !extracted.truckType)) {
      extracted.truckType = "Dump trailer";
    } else if (lower.includes("roll-off truck") || lower.includes("roll off truck") || lower.includes("roll-off system") || lower.includes("cable") || lower.includes("hook")) {
      extracted.truckType = "Roll-off truck";
    }
  }

  // Service radius
  const providerRadiusMatch = textWithoutUrls.match(/(\d+)\s*(?:\+?\s*)?(?:miles?|mi)\b/i);
  if (providerRadiusMatch) {
    extracted.serviceRadius = `${providerRadiusMatch[1]} Miles`;
    extracted.radiusMiles = Number(providerRadiusMatch[1]);
  }

  // Drivers count
  if (isProviderActive || lower.includes("driver") || lower.includes("operator")) {
    if (lower.includes("owner-operator") || lower.includes("owner operator") || lower.includes("just me") || lower.includes("solo")) {
      extracted.driversCount = 1;
    } else {
      const driverMatch = textWithoutUrls.match(/(\d+(?:\s*[-–to]\s*\d+)?|\d+\+?)\s*(?:drivers?|operators?|crews?)/i);
      if (driverMatch) {
        extracted.driversCount = driverMatch[1];
      }
    }
  }

  // Junk removal trucks & crews
  const junkTruckMatch = textWithoutUrls.match(/(\d+(?:\s*[-–to]\s*\d+)?|\d+\+?)\s*(?:trucks?|crews?)/i);
  if (junkTruckMatch && !extracted.truckCount) {
    extracted.truckCount = junkTruckMatch[1];
    if (!extracted.fleetCount) extracted.fleetCount = junkTruckMatch[1];
  }

  // Tree equipment
  if (lower.includes("bucket") || lower.includes("chipper") || lower.includes("crane") || lower.includes("climbing") || lower.includes("chainsaw")) {
    extracted.treeEquipment = textWithoutUrls;
  }

  // Porta Potty specific
  if (extracted.serviceType === "Porta Potty" || lower.includes("porta") || lower.includes("potty")) {
    if (lower.includes("construction") || lower.includes("jobsite")) extracted.useCase = "Construction Jobsite";
    if (lower.includes("event") || lower.includes("wedding") || lower.includes("party")) extracted.useCase = "Special Event";
    if (lower.includes("commercial") || lower.includes("industrial")) extracted.useCase = "Commercial / Industrial";
    if (lower.includes("home renovation")) extracted.useCase = "Home Renovation";

    const unitMatch = textWithoutUrls.match(/(\d+)\s*(?:units?|toilets?|restrooms?)/i);
    if (unitMatch) extracted.units = `${unitMatch[1]} Units`;
    else if (lower.includes("1 standard") || lower.includes("1 unit")) extracted.units = "1 Standard Unit";
    else if (lower.includes("2-4 units")) extracted.units = "2-4 Units";
    else if (lower.includes("5-10 units")) extracted.units = "5-10 Units";

    const durationMatch = textWithoutUrls.match(/(\d+)\s*(?:weeks?|months?|days?)/i);
    if (durationMatch) extracted.duration = durationMatch[0];
    else if (lower.includes("weekend")) extracted.duration = "Weekend (1-3 Days)";
    else if (lower.includes("1-2 weeks")) extracted.duration = "1-2 Weeks";
    else if (lower.includes("1 month")) extracted.duration = "1 Month";
  }

  // 8. Delivery Date (Natural language & ISO)
  const clientLocalDate = options.clientLocalDate || existingData.clientLocalDate;
  const clientTimestamp = options.clientTimestamp || existingData.clientTimestamp;
  const parsedDate = normalizeDate(textWithoutUrls, { clientLocalDate, clientTimestamp });
  if (parsedDate) {
    extracted.deliveryDate = parsedDate;
  }
  if (options.clientLocalDate) extracted.clientLocalDate = options.clientLocalDate;
  if (options.clientLocalTime) extracted.clientLocalTime = options.clientLocalTime;
  if (options.clientTimezone) extracted.clientTimezone = options.clientTimezone;
  if (options.clientTimestamp) extracted.clientTimestamp = options.clientTimestamp;

  // 9. Phone Number
  const phoneMatch = textWithoutUrls.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
  if (phoneMatch) {
    extracted.customerPhone = phoneMatch[0].trim();
    extracted.phone = extracted.customerPhone;
  }

  // 10. Email Address
  const emailMatch = textWithoutUrls.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) {
    extracted.customerEmail = emailMatch[0].toLowerCase().trim();
    extracted.email = extracted.customerEmail;
  }

  // 11. Photo URLs from chat uploads (Look at original text which contains URLs)
  const urlMatch =
    text.match(/https?:\/\/[^\s]+(?:\.(?:jpg|jpeg|png|webp|heic|heif|gif|avif)|\/uploads\/[^\s]+)/gi) ||
    (lower.includes("uploaded project photos") ? text.match(/https?:\/\/[^\s]+/gi) : null);
  if (urlMatch) {
    extracted.photos = urlMatch;
    extracted.photosProvided = true;
    delete extracted.photosSkipped;
  }

  // 12. Photo Skip Intent disabled - photos are mandatory for AI vision quote analysis
  delete extracted.photosSkipped;

  return extracted;
}

/**
 * Calculates current and next step state in the active funnel
 *
 * @param {string} [funnel="initial"]
 * @param {Object} [collectedData={}]
 * @returns {{ currentFunnel: string, currentStep: string, nextStep: string, missingFields: string[], isComplete: boolean }}
 */
export function calculateFunnelStep(funnel = "initial", collectedData = {}, registeredServices = null) {
  let currentFunnel = funnel;

  // 1. Non-retail intents take strict precedence over serviceType
  if (collectedData.primaryIntent === "I WANT TO JOIN AS A PROVIDER") {
    currentFunnel = "provider_onboarding";
  } else if (collectedData.primaryIntent === "I’M A CONTRACTOR / PROFESSIONAL") {
    // Only transition to dumpster booking if contractor explicitly chose "book_service"
    if (collectedData.contractorAction === "book_service") {
      currentFunnel = "dumpster_rental";
    } else {
      currentFunnel = "contractor_professional";
    }
  } else if (collectedData.primaryIntent === "I’M A BUILDER / COMMERCIAL CUSTOMER") {
    currentFunnel = "commercial_builder";
  } else if (collectedData.primaryIntent === "I HAVE A QUESTION") {
    currentFunnel = "general_faq";
  } else if (
    collectedData.serviceType ||
    collectedData.primaryIntent === "I NEED A SERVICE" ||
    String(collectedData.primaryIntent || "").toLowerCase().includes("need a service")
  ) {
    if (collectedData.serviceType) {
      const normalized = normalizeSalesServiceType(collectedData.serviceType);
      if (normalized === "Dumbster") currentFunnel = "dumpster_rental";
      else if (normalized === "Junk Removal") currentFunnel = "junk_removal";
      else if (normalized === "Tree Removal") currentFunnel = "tree_service";
      else if (normalized === "Porta Potty") currentFunnel = "porta_potty";
      else currentFunnel = "dumpster_rental";
    } else {
      currentFunnel = "service_booking";
    }
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
    if (!collectedData.zipCode && !collectedData.address) {
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

  // 2. Junk Removal Funnel (Client spec: What -> Location -> Amount -> Timing -> Photos -> Continue/Request Service)
  if (currentFunnel === "junk_removal") {
    // 1. What do you need removed?
    if (!collectedData.projectDescription && !collectedData.itemDescription) {
      return {
        currentFunnel: "junk_removal",
        currentStep: "scope",
        nextStep: "location",
        missingFields: ["projectDescription"],
        isComplete: false,
      };
    }
    // 2. Where is it located?
    if (!collectedData.zipCode && !collectedData.address) {
      return {
        currentFunnel: "junk_removal",
        currentStep: "location",
        nextStep: "volume",
        missingFields: ["zipCode"],
        isComplete: false,
      };
    }
    // 3. Approximately how much junk is there?
    const validJunkVolumes = ["Single Bulky Item", "1/4 Truckload", "1/2 Truckload", "Full Truckload", "Multiple Truckloads"];
    const hasValidVolume = collectedData.junkVolume || (collectedData.sizeOrVolume && validJunkVolumes.includes(collectedData.sizeOrVolume));
    if (!hasValidVolume) {
      return {
        currentFunnel: "junk_removal",
        currentStep: "volume",
        nextStep: "timing",
        missingFields: ["junkVolume"],
        isComplete: false,
      };
    }
    // 4. When do you need it removed?
    if (!collectedData.deliveryDate && !collectedData.timing) {
      return {
        currentFunnel: "junk_removal",
        currentStep: "timing",
        nextStep: "photos",
        missingFields: ["deliveryDate"],
        isComplete: false,
      };
    }
    // 5. Upload Photos (Strictly required for AI quote - minimum 2 clear photos)
    const hasValidPhotos =
      Boolean(collectedData.photosProvided || (Array.isArray(collectedData.photos) && collectedData.photos.length >= 2)) &&
      !collectedData.lowConfidence;
    if (!hasValidPhotos) {
      return {
        currentFunnel: "junk_removal",
        currentStep: "photos",
        nextStep: "checkout",
        missingFields: ["photos"],
        isComplete: false,
      };
    }
    // 6. Continue to Book / Request Service
    return {
      currentFunnel: "junk_removal",
      currentStep: "checkout",
      nextStep: "booking_complete",
      missingFields: [],
      isComplete: true,
    };
  }

  // 3. Tree Service Funnel (Client spec: Need Options -> Location -> Job Description -> Urgency -> Photos -> Request Service)
  if (currentFunnel === "tree_service") {
    // 0. What do you need help with?
    if (!collectedData.treeNeed) {
      return {
        currentFunnel: "tree_service",
        currentStep: "tree_need",
        nextStep: "location",
        missingFields: ["treeNeed"],
        isComplete: false,
      };
    }
    // 1. Location
    if (!collectedData.zipCode && !collectedData.address) {
      return {
        currentFunnel: "tree_service",
        currentStep: "location",
        nextStep: "job_description",
        missingFields: ["zipCode"],
        isComplete: false,
      };
    }
    // 2. Job description & property access
    if (!collectedData.jobDescription && !collectedData.projectDescription && !collectedData.treeDetails) {
      return {
        currentFunnel: "tree_service",
        currentStep: "job_description",
        nextStep: "timing_urgency",
        missingFields: ["jobDescription"],
        isComplete: false,
      };
    }
    // 3. Timing / urgency
    if (!collectedData.treeUrgency && !collectedData.urgency && !collectedData.deliveryDate) {
      return {
        currentFunnel: "tree_service",
        currentStep: "timing_urgency",
        nextStep: "photos",
        missingFields: ["treeUrgency"],
        isComplete: false,
      };
    }
    // 4. Upload Photos (Strictly required for AI quote - minimum 2 clear photos)
    const hasValidPhotos =
      Boolean(collectedData.photosProvided || (Array.isArray(collectedData.photos) && collectedData.photos.length >= 2)) &&
      !collectedData.lowConfidence;
    if (!hasValidPhotos) {
      return {
        currentFunnel: "tree_service",
        currentStep: "photos",
        nextStep: "checkout",
        missingFields: ["photos"],
        isComplete: false,
      };
    }
    // 5. Request Service / Continue to book
    return {
      currentFunnel: "tree_service",
      currentStep: "checkout",
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
    if (!collectedData.zipCode && !collectedData.address) {
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
    // Check if the user selected a service they are already registered for
    const userRegs = registeredServices || collectedData.registeredServices || {};
    if (Object.keys(userRegs).length > 0) {
      const serviceStr = (Array.isArray(collectedData.servicesOffered)
        ? collectedData.servicesOffered.join(" ")
        : String(collectedData.servicesOffered || collectedData.providerService || collectedData.serviceType || "")
      ).toLowerCase();

      let matchedDup = null;
      if ((serviceStr.includes("dumpster") || serviceStr.includes("roll-off")) && userRegs["Dumpster Rentals"]) {
        matchedDup = userRegs["Dumpster Rentals"];
      } else if (serviceStr.includes("junk") && userRegs["Junk Removal"]) {
        matchedDup = userRegs["Junk Removal"];
      } else if (serviceStr.includes("tree") && userRegs["Tree Services"]) {
        matchedDup = userRegs["Tree Services"];
      } else if ((serviceStr.includes("porta") || serviceStr.includes("sanitation")) && userRegs["Portable Sanitation"]) {
        matchedDup = userRegs["Portable Sanitation"];
      }

      if (matchedDup) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "already_registered",
          nextStep: "services_offered",
          missingFields: [],
          isComplete: false,
          duplicateService: matchedDup.serviceName,
          duplicateStatus: matchedDup.statusLabel,
        };
      }
    }

    // Step 1: Services Offered (Dumpster Rentals, Junk Removal, Tree Services, Portable Sanitation)
    if (!collectedData.servicesOffered || collectedData.servicesOffered.length === 0) {
      return {
        currentFunnel: "provider_onboarding",
        currentStep: "services_offered",
        nextStep: "provider_contact",
        missingFields: ["servicesOffered"],
        isComplete: false,
      };
    }

    // Step 2: Basic Business & Contact Information
    if (
      !collectedData.companyName &&
      !collectedData.contactName &&
      !collectedData.customerPhone &&
      !collectedData.customerEmail
    ) {
      return {
        currentFunnel: "provider_onboarding",
        currentStep: "provider_contact",
        nextStep: "service_specs",
        missingFields: ["companyName", "contactName", "customerPhone"],
        isComplete: false,
      };
    }

    // Step 3: Service-Specific Questions
    const serviceStr = (Array.isArray(collectedData.servicesOffered)
      ? collectedData.servicesOffered.join(" ")
      : String(collectedData.servicesOffered || collectedData.providerService || collectedData.serviceType || "")
    ).toLowerCase();

    const isDumpster = serviceStr.includes("dumpster") || serviceStr.includes("roll-off") || serviceStr.includes("bin");
    const isJunk = serviceStr.includes("junk") || serviceStr.includes("haul");
    const isTree = serviceStr.includes("tree");
    const isPorta = serviceStr.includes("porta") || serviceStr.includes("sanitation") || serviceStr.includes("toilet");

    if (isDumpster) {
      // 1. Number of dumpsters
      if (!collectedData.dumpsterQuantity && !collectedData.fleetCount) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "dumpster_count",
          nextStep: "dumpster_sizes",
          missingFields: ["dumpsterQuantity"],
          isComplete: false,
        };
      }
      // 2. Dumpster sizes
      if (!collectedData.dumpsterSizes || !collectedData.dumpsterSizes.length) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "dumpster_sizes",
          nextStep: "truck_system",
          missingFields: ["dumpsterSizes"],
          isComplete: false,
        };
      }
      // 3. Truck / system type
      if (!collectedData.truckType && !collectedData.liftSystem) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "truck_system",
          nextStep: "service_radius",
          missingFields: ["truckType"],
          isComplete: false,
        };
      }
      // 4. Service radius
      if (!collectedData.serviceRadius && !collectedData.radiusMiles) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "service_radius",
          nextStep: "drivers_count",
          missingFields: ["serviceRadius"],
          isComplete: false,
        };
      }
      // 5. Number of drivers
      if (!collectedData.driversCount) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "drivers_count",
          nextStep: "registration_prefill",
          missingFields: ["driversCount"],
          isComplete: false,
        };
      }
    } else if (isJunk) {
      if (!collectedData.fleetCount && !collectedData.truckCount) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "junk_trucks",
          nextStep: "service_radius",
          missingFields: ["fleetCount"],
          isComplete: false,
        };
      }
      if (!collectedData.serviceRadius && !collectedData.radiusMiles) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "service_radius",
          nextStep: "registration_prefill",
          missingFields: ["serviceRadius"],
          isComplete: false,
        };
      }
    } else if (isTree) {
      if (!collectedData.treeEquipment) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "tree_equipment",
          nextStep: "service_radius",
          missingFields: ["treeEquipment"],
          isComplete: false,
        };
      }
      if (!collectedData.serviceRadius && !collectedData.radiusMiles) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "service_radius",
          nextStep: "registration_prefill",
          missingFields: ["serviceRadius"],
          isComplete: false,
        };
      }
    } else if (isPorta) {
      if (!collectedData.units && !collectedData.unitCount) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "porta_units",
          nextStep: "service_radius",
          missingFields: ["units"],
          isComplete: false,
        };
      }
      if (!collectedData.serviceRadius && !collectedData.radiusMiles) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "service_radius",
          nextStep: "registration_prefill",
          missingFields: ["serviceRadius"],
          isComplete: false,
        };
      }
    } else {
      if (!collectedData.fleetCount) {
        return {
          currentFunnel: "provider_onboarding",
          currentStep: "fleet_specs",
          nextStep: "registration_prefill",
          missingFields: ["fleetCount"],
          isComplete: false,
        };
      }
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

    // Step 3a: User chose "Create Trade Account" -> Show lead form card to collect phone & email
    if (collectedData.contractorAction === "trade_account") {
      if (!collectedData.customerPhone || !collectedData.customerEmail) {
        return {
          currentFunnel: "contractor_professional",
          currentStep: "trade_account_form",
          nextStep: "trade_account_complete",
          missingFields: [
            ...(!collectedData.customerPhone ? ["customerPhone"] : []),
            ...(!collectedData.customerEmail ? ["customerEmail"] : []),
          ],
          isComplete: false,
        };
      }
      return {
        currentFunnel: "contractor_professional",
        currentStep: "trade_account_complete",
        nextStep: "service_booking",
        missingFields: [],
        isComplete: true,
      };
    }

    // Step 3b: User chose "Book A Service Now" -> Transition to dumpster booking
    if (collectedData.contractorAction === "book_service") {
      if (!collectedData.zipCode) {
        return {
          currentFunnel: "dumpster_rental",
          currentStep: "location",
          nextStep: collectedData.sizeOrVolume ? "checkout" : "dumpster_size",
          missingFields: ["zipCode"],
          isComplete: false,
        };
      }
      if (!collectedData.sizeOrVolume) {
        return {
          currentFunnel: "dumpster_rental",
          currentStep: "dumpster_size",
          nextStep: "delivery_date",
          missingFields: ["sizeOrVolume"],
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

    // Step 3c: User chose "Talk To Commercial Desk"
    if (collectedData.contractorAction === "commercial_desk") {
      if (!collectedData.customerPhone) {
        return {
          currentFunnel: "contractor_professional",
          currentStep: "commercial_desk_contact",
          nextStep: "specialist_connected",
          missingFields: ["customerPhone"],
          isComplete: false,
        };
      }
      return {
        currentFunnel: "contractor_professional",
        currentStep: "specialist_connected",
        nextStep: "specialist_connected",
        missingFields: [],
        isComplete: true,
      };
    }

    // Default: Present Next Step options to the trade professional
    return {
      currentFunnel: "contractor_professional",
      currentStep: "contractor_action",
      nextStep: "trade_account_form",
      missingFields: ["contractorAction"],
      isComplete: false,
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
  liveSizes = null,
  registeredServices = null
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

  // Location Step (Dumpster Rental, Junk Removal, Tree Service, Porta Potty - Powered by Google Places)
  if (currentStep === "location") {
    let serviceTitle = "Service Delivery Address";
    let serviceDesc = "Search your full jobsite address or ZIP code with Google Places to verify local service availability.";
    let placeholder = "Search address, city, or ZIP code with Google Places…";

    if (currentFunnel === "junk_removal") {
      serviceTitle = "Junk Removal Jobsite Address";
      serviceDesc = "Search your full property address or ZIP code with Google Places for your cleanout.";
      placeholder = "Search property address or ZIP code…";
    } else if (currentFunnel === "dumpster_rental") {
      serviceTitle = "Dumpster Delivery Address";
      serviceDesc = "Search your full delivery address or ZIP code with Google Places to check local dumpster availability and pricing.";
      placeholder = "Search delivery address or ZIP code…";
    } else if (currentFunnel === "tree_service") {
      serviceTitle = "Tree Service Property Address";
      serviceDesc = "Search your property address or ZIP code with Google Places so local arborists can locate the jobsite.";
      placeholder = "Search property address or ZIP code…";
    } else if (currentFunnel === "porta_potty") {
      serviceTitle = "Porta Potty Delivery Address";
      serviceDesc = "Search the delivery address or ZIP code with Google Places for sanitation placement.";
      placeholder = "Search delivery address or ZIP code…";
    }

    return {
      cardType: "location_picker",
      sessionId,
      payload: {
        title: serviceTitle,
        description: serviceDesc,
        placeholder,
        detectedZip: collectedData.detectedZip || null,
        detectedAddress: collectedData.address || collectedData.deliveryAddress || null,
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
    const refDate = collectedData.clientLocalDate || new Date().toISOString().split("T")[0];
    let baseDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(refDate)) {
      const [y, m, d] = refDate.split("-").map(Number);
      baseDate = new Date(y, m - 1, d, 12, 0, 0);
    } else {
      baseDate = new Date();
    }

    const getShiftedDate = (days) => {
      const target = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + days, 12, 0, 0);
      const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
      const short = target.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return { iso, short };
    };

    const tomorrow = getShiftedDate(1);
    const in2Days = getShiftedDate(2);

    const currentDay = baseDate.getDay(); // 0 is Sun, 5 is Fri, 1 is Mon
    let daysToFriday = 5 - currentDay;
    if (daysToFriday <= 1) daysToFriday += 7;
    let daysToMonday = 1 - currentDay;
    if (daysToMonday <= 1) daysToMonday += 7;

    const friday = getShiftedDate(daysToFriday);
    const monday = getShiftedDate(daysToMonday);

    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "When do you need the dumpster delivered?",
        options: [
          { label: `Tomorrow (${tomorrow.short})`, value: `Tomorrow (${tomorrow.iso})` },
          { label: `In 2 Days (${in2Days.short})`, value: `In 2 days (${in2Days.iso})` },
          { label: `Friday (${friday.short})`, value: `Friday (${friday.iso})` },
          { label: `Next Monday (${monday.short})`, value: `Next Monday (${monday.iso})` },
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
    if (collectedData.address || collectedData.deliveryAddress) {
      searchParams.set("address", collectedData.address || collectedData.deliveryAddress);
    }
    if (collectedData.city) searchParams.set("city", collectedData.city);
    if (collectedData.state) searchParams.set("state", collectedData.state);
    if (collectedData.sizeOrVolume) searchParams.set("size", collectedData.sizeOrVolume);
    if (collectedData.deliveryDate) searchParams.set("date", collectedData.deliveryDate);
    if (collectedData.lat != null && collectedData.lng != null) {
      searchParams.set("lat", String(collectedData.lat));
      searchParams.set("lng", String(collectedData.lng));
    }
    searchParams.set("ref_token", `chk_${sessionId}`);
    searchParams.set("step", "5");

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
          address: collectedData.address || collectedData.deliveryAddress || null,
          city: collectedData.city || null,
          state: collectedData.state || null,
          lat: collectedData.lat != null ? Number(collectedData.lat) : null,
          lng: collectedData.lng != null ? Number(collectedData.lng) : null,
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
        title: "What do you need removed?",
        options: [
          { label: "Old House / Estate Cleanout", value: "Old house cleanout" },
          { label: "Furniture & Appliances", value: "Furniture & Appliances" },
          { label: "Garage / Basement Cleanout", value: "Garage / Basement Cleanout" },
          { label: "Yard Waste & Debris", value: "Yard Waste & Debris" },
          { label: "Construction Debris", value: "Construction Debris" },
          { label: "Single Bulky Item", value: "Single Bulky Item" },
        ],
      },
    };
  }

  // Junk Removal: Volume Selection Card
  if (currentFunnel === "junk_removal" && currentStep === "volume") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "Approximately how much junk is there?",
        options: [
          { label: "Single Bulky Item", value: "Single Bulky Item" },
          { label: "1/4 Truckload (Mini Cleanout)", value: "1/4 Truckload" },
          { label: "1/2 Truckload (Medium Cleanout)", value: "1/2 Truckload" },
          { label: "Full Truckload (Large Cleanout)", value: "Full Truckload" },
          { label: "Multiple Truckloads (Major Cleanout)", value: "Multiple Truckloads" },
        ],
      },
    };
  }

  // Junk Removal: Timing Selection Card
  if (currentFunnel === "junk_removal" && currentStep === "timing") {
    const refDate = collectedData.clientLocalDate || new Date().toISOString().split("T")[0];
    let baseDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(refDate)) {
      const [y, m, d] = refDate.split("-").map(Number);
      baseDate = new Date(y, m - 1, d, 12, 0, 0);
    } else {
      baseDate = new Date();
    }

    const getShiftedDate = (days) => {
      const target = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + days, 12, 0, 0);
      const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
      const short = target.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return { iso, short };
    };

    const tomorrow = getShiftedDate(1);
    const in2Days = getShiftedDate(2);

    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "When do you need it removed?",
        options: [
          { label: "Today / ASAP", value: "Today" },
          { label: `Tomorrow (${tomorrow.short})`, value: `Tomorrow (${tomorrow.iso})` },
          { label: `In 2-3 Days (${in2Days.short})`, value: `In 2-3 days (${in2Days.iso})` },
          { label: "This Weekend", value: "This Weekend" },
          { label: "Flexible Timing", value: "Flexible" },
        ],
      },
    };
  }

  // Junk Removal: Photos Card (Strictly required - exactly 2 photos for AI quote analysis)
  if (currentFunnel === "junk_removal" && currentStep === "photos") {
    const isLowConfidence = Boolean(collectedData.lowConfidence);
    const score = collectedData.confidenceScore;
    return {
      cardType: "media_upload",
      sessionId,
      payload: {
        title: isLowConfidence ? "Please Upload 2 Clearer Photos" : "Upload 2 Photos for Instant AI Quote",
        description: isLowConfidence
          ? `The uploaded photos were too blurry or unclear (AI confidence: ${score != null ? `${score}%` : "below 50%"}). Please upload 2 well-lit, clearer photos showing the items clearly so our AI can accurately calculate your quote.`
          : "Upload exactly 2 clear photos of your junk. Our AI will analyze them immediately to estimate volume and generate your quote.",
        serviceType: "Junk Removal",
        acceptedFormats: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
          ".heic",
          ".heif",
        ],
        minFiles: 2,
        maxFiles: 2,
        optional: false,
        isReupload: isLowConfidence,
        confidenceScore: score || null,
      },
    };
  }

  // Junk Removal: Checkout / Request Service Card
  if (currentFunnel === "junk_removal" && currentStep === "checkout") {
    const searchParams = new URLSearchParams();
    if (collectedData.zipCode) searchParams.set("zip", collectedData.zipCode);
    if (collectedData.address || collectedData.deliveryAddress) {
      searchParams.set("address", collectedData.address || collectedData.deliveryAddress);
    }
    if (collectedData.city) searchParams.set("city", collectedData.city);
    if (collectedData.state) searchParams.set("state", collectedData.state);
    if (collectedData.lat != null && collectedData.lng != null) {
      searchParams.set("lat", String(collectedData.lat));
      searchParams.set("lng", String(collectedData.lng));
    }
    if (collectedData.junkVolume || collectedData.sizeOrVolume) {
      searchParams.set("size", collectedData.junkVolume || collectedData.sizeOrVolume);
    }
    if (collectedData.deliveryDate) searchParams.set("date", collectedData.deliveryDate);
    searchParams.set("ref_token", `chk_${sessionId}`);

    const isManualReview = Boolean(
      collectedData.manualReviewRequired ||
      collectedData.junkAnalysis?.pricing_result?.manual_review_required
    );
    const reasons =
      collectedData.manualReviewReasons ||
      collectedData.junkAnalysis?.pricing_result?.manual_review_reasons ||
      [];

    return {
      cardType: "checkout_link",
      sessionId,
      payload: {
        title: isManualReview ? "Request Junk Removal (Review Required)" : "Request Junk Removal Service",
        checkoutUrl: `${BASE_FRONTEND_URL}/book/junk-removal?${searchParams.toString()}`,
        token: `chk_${sessionId}`,
        ref_token: `chk_${sessionId}`,
        manualReviewRequired: isManualReview,
        manualReviewReasons: reasons,
        summary: {
          serviceType: "Junk Removal",
          items: collectedData.projectDescription || collectedData.itemDescription || "General Cleanout",
          sizeOrVolume: collectedData.junkVolume || collectedData.sizeOrVolume || "Custom Volume",
          zipCode: collectedData.zipCode,
          address: collectedData.address || collectedData.deliveryAddress || null,
          city: collectedData.city || null,
          state: collectedData.state || null,
          lat: collectedData.lat != null ? Number(collectedData.lat) : null,
          lng: collectedData.lng != null ? Number(collectedData.lng) : null,
          deliveryDate: collectedData.deliveryDate || "Flexible",
          photosCount: Array.isArray(collectedData.photos) ? collectedData.photos.length : 0,
          estimatedPrice: collectedData.estimatedPrice || null,
          hasAiAnalysis: Boolean(collectedData.junkAnalysis),
          manualReviewRequired: isManualReview,
          manualReviewReasons: reasons,
        },
        buttonText: isManualReview ? "Submit for Admin Review" : "Continue to Book",
      },
    };
  }

  // Tree Service: Need Selection Card (Exact client options: Tree removal, Fallen tree, Storm cleanup, Tree trimming, Property cleanup, Other)
  if (currentFunnel === "tree_service" && currentStep === "tree_need") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "What do you need help with?",
        options: [
          { label: "Tree removal", value: "Tree removal" },
          { label: "Fallen tree", value: "Fallen tree" },
          { label: "Storm cleanup", value: "Storm cleanup" },
          { label: "Tree trimming", value: "Tree trimming" },
          { label: "Property cleanup", value: "Property cleanup" },
          { label: "Other", value: "Other" },
        ],
      },
    };
  }

  // Tree Service: Job Description & Access Details Card
  if (currentFunnel === "tree_service" && currentStep === "job_description") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "Tree Location & Property Access Details",
        options: [
          { label: "Backyard (Standard Gate Access)", value: "Backyard with standard gate access" },
          { label: "Front Yard (Open Driveway Access)", value: "Front yard with open driveway access" },
          { label: "Near Roof / Structure Hazard", value: "Resting near house roof or structure" },
          { label: "Near Electrical Power Lines", value: "Near power lines or utility hazard" },
          { label: "Very Large / Tall Mature Tree", value: "Very large or tall mature tree" },
        ],
      },
    };
  }

  // Tree Service: Timing / Urgency Card
  if (currentFunnel === "tree_service" && currentStep === "timing_urgency") {
    return {
      cardType: "quick_replies",
      sessionId,
      payload: {
        title: "How urgent is this tree service?",
        options: [
          { label: "Emergency / Hazard (Immediate)", value: "Emergency / Hazard" },
          { label: "Within 24-48 Hours", value: "Within 24-48 Hours" },
          { label: "This Week", value: "This Week" },
          { label: "Flexible / Non-urgent", value: "Flexible" },
        ],
      },
    };
  }

  // Tree Service: Photos Card (Strictly required - exactly 2 photos for AI tree assessment)
  if (currentFunnel === "tree_service" && currentStep === "photos") {
    const isLowConfidence = Boolean(collectedData.lowConfidence);
    const score = collectedData.confidenceScore;
    return {
      cardType: "media_upload",
      sessionId,
      payload: {
        title: isLowConfidence ? "Please Upload 2 Clearer Photos" : "Upload 2 Photos for Instant AI Tree Assessment",
        description: isLowConfidence
          ? `The uploaded photos were too blurry or obstructed (AI confidence: ${score != null ? `${score}%` : "below 50%"}). Please upload 2 well-lit, clearer photos showing the full tree and ground access.`
          : "Upload exactly 2 clear photos of the tree. Our AI inspector will analyze height, access, and hazards to prepare your quote.",
        serviceType: "Tree Removal",
        acceptedFormats: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
          ".heic",
          ".heif",
        ],
        minFiles: 2,
        maxFiles: 2,
        optional: false,
        isReupload: isLowConfidence,
        confidenceScore: score || null,
      },
    };
  }

  // Tree Service: Checkout / Request Service Card
  if (currentFunnel === "tree_service" && currentStep === "checkout") {
    const searchParams = new URLSearchParams();
    if (collectedData.zipCode) searchParams.set("zip", collectedData.zipCode);
    if (collectedData.address || collectedData.deliveryAddress) {
      searchParams.set("address", collectedData.address || collectedData.deliveryAddress);
    }
    if (collectedData.city) searchParams.set("city", collectedData.city);
    if (collectedData.state) searchParams.set("state", collectedData.state);
    if (collectedData.lat != null && collectedData.lng != null) {
      searchParams.set("lat", String(collectedData.lat));
      searchParams.set("lng", String(collectedData.lng));
    }
    if (collectedData.treeNeed) searchParams.set("need", collectedData.treeNeed);
    if (collectedData.treeUrgency || collectedData.urgency) {
      searchParams.set("urgency", collectedData.treeUrgency || collectedData.urgency);
    }
    searchParams.set("ref_token", `chk_${sessionId}`);

    const isManualReview = Boolean(
      collectedData.manualReviewRequired ||
      collectedData.treeAnalysis?.pricing_result?.manual_review_required
    );
    const reasons =
      collectedData.manualReviewReasons ||
      collectedData.treeAnalysis?.pricing_result?.manual_review_reasons ||
      [];

    return {
      cardType: "checkout_link",
      sessionId,
      payload: {
        title: isManualReview ? "Request Tree Service (Review Required)" : "Request Tree Service",
        checkoutUrl: `${BASE_FRONTEND_URL}/book/tree-removal?${searchParams.toString()}`,
        token: `chk_${sessionId}`,
        ref_token: `chk_${sessionId}`,
        manualReviewRequired: isManualReview,
        manualReviewReasons: reasons,
        summary: {
          serviceType: "Tree Service",
          treeNeed: collectedData.treeNeed || "Tree Service",
          jobDescription: collectedData.projectDescription || collectedData.jobDescription || "Tree work",
          urgency: collectedData.treeUrgency || collectedData.urgency || "Standard",
          zipCode: collectedData.zipCode,
          address: collectedData.address || collectedData.deliveryAddress || null,
          city: collectedData.city || null,
          state: collectedData.state || null,
          lat: collectedData.lat != null ? Number(collectedData.lat) : null,
          lng: collectedData.lng != null ? Number(collectedData.lng) : null,
          photosCount: Array.isArray(collectedData.photos) ? collectedData.photos.length : 0,
          estimatedPrice: collectedData.estimatedPrice || null,
          hasAiAnalysis: Boolean(collectedData.treeAnalysis),
          manualReviewRequired: isManualReview,
          manualReviewReasons: reasons,
        },
        buttonText: isManualReview ? "Request Arborist Review" : "Request Service",
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
    if (collectedData.address || collectedData.deliveryAddress) {
      searchParams.set("address", collectedData.address || collectedData.deliveryAddress);
    }
    if (collectedData.city) searchParams.set("city", collectedData.city);
    if (collectedData.state) searchParams.set("state", collectedData.state);
    if (collectedData.lat != null && collectedData.lng != null) {
      searchParams.set("lat", String(collectedData.lat));
      searchParams.set("lng", String(collectedData.lng));
    }
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
          address: collectedData.address || collectedData.deliveryAddress || null,
          city: collectedData.city || null,
          state: collectedData.state || null,
          lat: collectedData.lat != null ? Number(collectedData.lat) : null,
          lng: collectedData.lng != null ? Number(collectedData.lng) : null,
          deliveryDate: collectedData.deliveryDate,
        },
        buttonText: "Complete Instant Booking",
      },
    };
  }

  // Provider Onboarding Cards
  if (currentFunnel === "provider_onboarding") {
    if (currentStep === "already_registered") {
      const userRegs = registeredServices || collectedData.registeredServices || {};
      const dupSrv = collectedData.duplicateService || "this service";
      const dupStatus = collectedData.duplicateStatus || userRegs[dupSrv]?.statusLabel || "Active";
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: `You are already registered for ${dupSrv}`,
          description: `Current status: ${dupStatus}. Duplicate registrations are not permitted.`,
          options: PROVIDER_SERVICE_OPTIONS.filter((opt) => !userRegs[opt.value]),
        },
      };
    }
    if (currentStep === "services_offered") {
      const userRegs = registeredServices || collectedData.registeredServices || {};
      const options = PROVIDER_SERVICE_OPTIONS.map((opt) => {
        const reg = userRegs[opt.value];
        if (reg) {
          return {
            ...opt,
            label: `${opt.label} (Already Registered)`,
            status: reg.statusLabel,
            disabled: true,
          };
        }
        return opt;
      });
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "What service does your company provide?",
          options,
        },
      };
    }
    if (currentStep === "provider_contact") {
      return {
        cardType: "lead_form",
        sessionId,
        payload: {
          title: "Provider Business & Contact Details",
          description: "FREE TO REGISTER • FREE TO RECEIVE JOB ALERTS • NO MONTHLY SUBSCRIPTION",
          serviceType: collectedData.providerService || "Provider Partner",
          fields: [
            { name: "companyName", label: "Company / Business Name", placeholder: "e.g. Acme Hauling LLC", required: true },
            { name: "contactName", label: "Contact Person", placeholder: "e.g. John Doe", required: true },
            { name: "phone", label: "Direct Phone", placeholder: "e.g. (555) 000-0000", required: true },
            { name: "email", label: "Business Email", placeholder: "e.g. info@acmehauling.com" },
            { name: "zipCode", label: "Base Service Area ZIP", placeholder: "e.g. 75001" },
          ],
        },
      };
    }
    if (currentStep === "dumpster_count") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "How many dumpsters are in your fleet?",
          options: [
            { label: "1-5 Roll-Off Dumpsters", value: "1-5 Dumpsters" },
            { label: "6-15 Roll-Off Dumpsters", value: "6-15 Dumpsters" },
            { label: "16-30 Roll-Off Dumpsters", value: "16-30 Dumpsters" },
            { label: "30+ Dumpsters (Commercial Fleet)", value: "30+ Dumpsters" },
          ],
        },
      };
    }
    if (currentStep === "dumpster_sizes") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "Which dumpster sizes do you offer?",
          options: [
            { label: "10, 15 & 20 Yard", value: "10, 15, 20 Yard" },
            { label: "20 & 30 Yard (Standard)", value: "20, 30 Yard" },
            { label: "All Sizes (10-40 Yard)", value: "All Sizes (10-40 Yard)" },
            { label: "Rubber-Wheeled / Trailer Bins", value: "Trailer Bins" },
          ],
        },
      };
    }
    if (currentStep === "truck_system") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "What truck type do you operate?",
          options: [
            { label: "Roll-Off Truck", value: "Roll-off truck" },
            { label: "Dump Trailer", value: "Dump trailer" },
            { label: "Both (Roll-off & Trailer)", value: "Both" },
          ],
        },
      };
    }
    if (currentStep === "service_radius") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "What is your primary service radius?",
          options: [
            { label: "15 Mile Radius", value: "15 Miles" },
            { label: "25 Mile Radius", value: "25 Miles" },
            { label: "35 Mile Radius", value: "35 Miles" },
            { label: "50+ Mile Radius", value: "50 Miles" },
          ],
        },
      };
    }
    if (currentStep === "drivers_count") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "How many active drivers do you operate?",
          options: [
            { label: "Owner-Operator (1 Driver)", value: "1 Driver" },
            { label: "2-4 Drivers", value: "2-4 Drivers" },
            { label: "5-10 Drivers", value: "5-10 Drivers" },
            { label: "10+ Drivers", value: "10+ Drivers" },
          ],
        },
      };
    }
    if (currentStep === "junk_trucks") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "How many junk removal trucks / crews do you run?",
          options: [
            { label: "1-2 Trucks", value: "1-2 Trucks" },
            { label: "3-5 Trucks", value: "3-5 Trucks" },
            { label: "6+ Trucks", value: "6+ Trucks" },
          ],
        },
      };
    }
    if (currentStep === "tree_equipment") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "What tree service equipment do you operate?",
          options: [
            { label: "Bucket Truck & Chipper", value: "Bucket truck" },
            { label: "Crane & Heavy Rigging", value: "Crane" },
            { label: "Climbing Gear & Chainsaws", value: "Climbing gear" },
            { label: "Full Heavy Fleet", value: "Full Fleet" },
          ],
        },
      };
    }
    if (currentStep === "porta_units") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "How many portable restroom units in your inventory?",
          options: [
            { label: "10-50 Restroom Units", value: "10-50 Units" },
            { label: "50-200 Units", value: "50-200 Units" },
            { label: "200+ Commercial Units", value: "200+ Units" },
          ],
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
      const serviceStr = (Array.isArray(collectedData.servicesOffered)
        ? collectedData.servicesOffered.join(" ")
        : String(collectedData.servicesOffered || collectedData.providerService || collectedData.serviceType || "")
      ).toLowerCase();

      const isDumpster = serviceStr.includes("dumpster") || serviceStr.includes("roll-off") || serviceStr.includes("bin");
      const isJunk = serviceStr.includes("junk") || serviceStr.includes("haul");
      const isTree = serviceStr.includes("tree");
      const isPorta = serviceStr.includes("porta") || serviceStr.includes("sanitation") || serviceStr.includes("toilet");

      const serviceParam = isDumpster
        ? "dumpster"
        : isJunk
          ? "junk-removal"
          : isTree
            ? "tree-services"
            : isPorta
              ? "portable-sanitation"
              : "dumpster";

      const queryParams = new URLSearchParams();
      queryParams.set("service", serviceParam);
      if (collectedData.customerPhone || collectedData.phone) {
        queryParams.set("phone", collectedData.customerPhone || collectedData.phone);
      }
      if (collectedData.customerEmail || collectedData.email) {
        queryParams.set("email", collectedData.customerEmail || collectedData.email);
      }
      if (collectedData.zipCode) {
        queryParams.set("zip", collectedData.zipCode);
      }
      if (collectedData.companyName) {
        queryParams.set("company", collectedData.companyName);
      }

      const checkoutUrl = `/providers/register?${queryParams.toString()}`;

      return {
        cardType: "checkout_link",
        sessionId,
        payload: {
          title: "Join BinsApp Operator Network",
          checkoutUrl,
          registrationUrl: checkoutUrl,
          ctaType: "provider_registration",
          token: `prov_${sessionId}`,
          buttonText: "Continue Free Registration",
          serviceType: "Provider Partner",
          summary: {
            serviceType: "Provider Partner",
            registrationUrl: checkoutUrl,
            companyName: collectedData.companyName || "",
            contactName: collectedData.contactName || collectedData.ownerName || "",
            phone: collectedData.customerPhone || collectedData.phone || "",
            email: collectedData.customerEmail || collectedData.email || "",
            zipCode: collectedData.zipCode || "",
            dumpsterQuantity: collectedData.dumpsterQuantity || collectedData.fleetCount || "",
            dumpsterSizes: collectedData.dumpsterSizes || [],
            truckType: collectedData.truckType || "",
            liftSystem: collectedData.liftSystem || "",
            radiusMiles: collectedData.radiusMiles || collectedData.serviceRadius || "",
            driversCount: collectedData.driversCount || "",
          },
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
            { label: "Create Trade Account", value: "Create Trade Account" },
            { label: "Book A Service Now", value: "Book A Service Now" },
            { label: "Talk To Commercial Desk", value: "Talk To Commercial Desk" },
          ],
        },
      };
    }
    if (currentStep === "trade_account_form") {
      return {
        cardType: "lead_form",
        sessionId,
        payload: {
          title: "Create Trade Account",
          description: "Volume contractor rates, dedicated dispatcher & priority container swaps.",
          customerType: "contractor",
          fields: [
            { name: "companyName", label: "Business / Company Name", placeholder: "e.g. Acme Contracting LLC", defaultValue: collectedData.businessType || "" },
            { name: "contactName", label: "Contact Person", placeholder: "e.g. John Doe", required: true },
            { name: "phone", label: "Direct Phone Number", placeholder: "e.g. (555) 000-0000", required: true },
            { name: "email", label: "Business Email", placeholder: "e.g. john@acmecontracting.com", required: true },
          ],
        },
      };
    }
    if (currentStep === "trade_account_complete") {
      return {
        cardType: "quick_replies",
        sessionId,
        payload: {
          title: "Trade Account Profile Created!",
          options: [
            { label: "Book Dumpster With Trade Rates", value: "Book A Service Now" },
            { label: "Talk To Commercial Desk", value: "Talk To Commercial Desk" },
          ],
        },
      };
    }
    if (currentStep === "commercial_desk_contact") {
      return {
        cardType: "lead_form",
        sessionId,
        payload: {
          title: "Commercial Desk Dispatcher",
          description: "Connect with our senior commercial dispatch team for customized billing & fleet support.",
          customerType: "commercial",
          fields: [
            { name: "contactName", label: "Contact Person", placeholder: "e.g. John Doe", required: true },
            { name: "phone", label: "Direct Phone", placeholder: "e.g. (555) 000-0000", required: true },
            { name: "notes", label: "Project / Account Requirements", placeholder: "e.g. Need 3 dumpsters rotated weekly", required: false },
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
          fields: [
            { name: "companyName", label: "Company / Business Name", placeholder: "e.g. Acme Builders LLC" },
            { name: "contactName", label: "Contact Name", placeholder: "e.g. John Doe", required: true },
            { name: "phone", label: "Direct Phone Number", placeholder: "e.g. (555) 000-0000", required: true },
            { name: "email", label: "Business Email", placeholder: "e.g. john@acmebuilders.com" },
          ],
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
          fields: [
            { name: "contactName", label: "Contact Name", placeholder: "e.g. John Doe", required: true },
            { name: "phone", label: "Phone Number", placeholder: "e.g. (555) 000-0000", required: true },
            { name: "companyName", label: "Company / Business Name", placeholder: "e.g. Apex Construction" },
          ],
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

  const existingService = existing.collectedData?.serviceType;
  const isResetService = Boolean(
    stateUpdates.resetService ||
    stateUpdates.collectedData?.resetService ||
    (stateUpdates.collectedData?.primaryIntent === "I NEED A SERVICE" && !stateUpdates.collectedData?.serviceType)
  );
  const newService = stateUpdates.collectedData?.serviceType;
  let mergedCollectedData;

  // If user reset service (e.g. said "I need a service"), cleanly purge previous service data
  if (isResetService) {
    const baseData = { ...(existing.collectedData || {}) };
    delete baseData.serviceType;
    delete baseData.sizeOrVolume;
    delete baseData.availableSizes;
    delete baseData.dumpsterSize;
    delete baseData.threeDaysPrice;
    delete baseData.sevenDaysPrice;
    delete baseData.junkVolume;
    delete baseData.treeNeed;
    delete baseData.treeUrgency;
    delete baseData.quote;
    delete baseData.estimatedPrice;
    delete baseData.junkAnalysis;
    delete baseData.treeAnalysis;
    delete baseData.checkoutInitiated;
    delete baseData.deliveryDate;
    delete baseData.bookingComplete;
    delete baseData.photos;
    delete baseData.photosSkipped;
    const cleanUpdates = { ...(stateUpdates.collectedData || {}) };
    delete cleanUpdates.resetService;
    delete cleanUpdates.serviceType;
    mergedCollectedData = { ...baseData, ...cleanUpdates, primaryIntent: "I NEED A SERVICE" };
  } else if (newService && existingService && newService !== existingService) {
    const baseData = { ...(existing.collectedData || {}) };
    if (newService !== "Dumbster") {
      delete baseData.sizeOrVolume;
      delete baseData.availableSizes;
      delete baseData.dumpsterSize;
      delete baseData.threeDaysPrice;
      delete baseData.sevenDaysPrice;
    }
    if (newService !== "Junk Removal") {
      delete baseData.junkVolume;
    }
    if (newService !== "Tree Removal") {
      delete baseData.treeNeed;
      delete baseData.treeUrgency;
    }
    delete baseData.checkoutInitiated;
    mergedCollectedData = { ...baseData, ...(stateUpdates.collectedData || {}) };
  } else {
    if (stateUpdates.collectedData?.lowConfidence) {
      const baseData = { ...(existing.collectedData || {}) };
      delete baseData.photos;
      delete baseData.photosProvided;
      delete baseData.junkAnalysis;
      delete baseData.treeAnalysis;
      delete baseData.estimatedPrice;
      delete baseData.aiEstimatedCubicYards;
      mergedCollectedData = { ...baseData, ...(stateUpdates.collectedData || {}) };
      delete mergedCollectedData.photos;
      delete mergedCollectedData.photosProvided;
    } else {
      mergedCollectedData = {
        ...(existing.collectedData || {}),
        ...(stateUpdates.collectedData || {}),
      };
      if (stateUpdates.collectedData && !stateUpdates.collectedData.lowConfidence) {
        delete mergedCollectedData.lowConfidence;
        delete mergedCollectedData.confidenceScore;
        delete mergedCollectedData.lowConfidenceReason;
      }
    }
  }

  // Derive target funnel dynamically from intent and serviceType
  let targetFunnel = stateUpdates.currentFunnel || existing.currentFunnel || "initial_intent";
  if (isResetService) {
    targetFunnel = "service_booking";
  } else if (mergedCollectedData.primaryIntent === "I WANT TO JOIN AS A PROVIDER") {
    targetFunnel = "provider_onboarding";
  } else if (
    mergedCollectedData.primaryIntent === "I’M A CONTRACTOR / PROFESSIONAL" &&
    mergedCollectedData.contractorAction !== "book_service"
  ) {
    targetFunnel = "contractor_professional";
  } else if (mergedCollectedData.primaryIntent === "I’M A BUILDER / COMMERCIAL CUSTOMER") {
    targetFunnel = "commercial_builder";
  } else if (mergedCollectedData.serviceType) {
    const norm = normalizeSalesServiceType(mergedCollectedData.serviceType);
    if (norm === "Junk Removal") targetFunnel = "junk_removal";
    else if (norm === "Tree Removal") targetFunnel = "tree_service";
    else if (norm === "Porta Potty") targetFunnel = "porta_potty";
    else if (norm === "Dumbster") targetFunnel = "dumpster_rental";
  }

  const stepInfo = calculateFunnelStep(targetFunnel, mergedCollectedData);

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

/**
 * Calculates a summary of an unfinished booking if present in the funnel state
 *
 * @param {Object} funnelState
 * @returns {Object|null}
 */
/**
 * Formats keys, snake_case strings, or camelCase identifiers into clean, human-readable labels without underscores.
 */
export function formatFriendlyLabel(str) {
  if (!str) return "";
  const s = String(str).trim();
  const lower = s.toLowerCase();

  const SPECIAL_MAP = {
    customerphone: "Phone Number",
    phone: "Phone Number",
    customeremail: "Email Address",
    email: "Email Address",
    customername: "Full Name",
    contactname: "Contact Person",
    companyname: "Company Name",
    ownername: "Owner Name",
    zipcode: "ZIP Code",
    zip: "ZIP Code",
    trade_account_form: "Trade Account Form",
    trade_account: "Trade Account",
    contractor_intake: "Contractor Intake",
    commercial_builder: "Contractor Account",
    provider_onboarding: "Provider Onboarding",
    initial_intent: "Service Selection",
    service_booking: "Service Selection",
    deliverydate: "Delivery Date",
    delivery_date: "Delivery Date",
    dumpster_size: "Dumpster Size",
    sizeorvolume: "Dumpster Size",
    size_or_volume: "Dumpster Size",
    projecttype: "Project Type",
    project_type: "Project Type",
    jobdescription: "Job Details",
    job_description: "Job Details",
    tree_need: "Tree Service Type",
    timing_urgency: "Urgency",
    driverscount: "Drivers Count",
    drivers_count: "Drivers Count",
    trucktype: "Truck Type",
    truck_type: "Truck Type",
    serviceradius: "Service Radius",
    service_radius: "Service Radius",
    lead_form: "Contact Form",
    unit_count: "Number of Units",
    use_case: "Use Case",
    start_date: "Delivery Date",
    duration: "Rental Duration",
    scope: "Project Scope",
    volume: "Estimated Volume",
    timing: "Preferred Timing",
    photos: "Upload Photos",
    checkout: "Checkout",
  };

  const normalized = lower.replace(/[^a-z0-9_]/g, "");
  if (SPECIAL_MAP[normalized]) {
    return SPECIAL_MAP[normalized];
  }

  return s
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Calculates a summary of an unfinished booking if present in the funnel state
 *
 * @param {Object} funnelState
 * @returns {Object|null}
 */
export function getUnfinishedBookingSummary(funnelState) {
  if (!funnelState || !funnelState.collectedData) return null;
  const data = funnelState.collectedData;
  if (!data.serviceType && !data.primaryIntent) return null;
  if (data.bookingComplete || funnelState.currentStep === "booking_complete") return null;

  let serviceName = "Dumpster Rental";
  if (funnelState.currentFunnel === "junk_removal" || data.serviceType === "Junk Removal") {
    serviceName = "Junk Removal";
  } else if (funnelState.currentFunnel === "tree_service" || data.serviceType === "Tree Removal") {
    serviceName = "Tree Service";
  } else if (funnelState.currentFunnel === "porta_potty" || data.serviceType === "Porta Potty") {
    serviceName = "Porta Potty Rental";
  } else if (
    funnelState.currentFunnel === "commercial_builder" ||
    funnelState.currentFunnel === "contractor_professional"
  ) {
    serviceName = "Contractor Trade Account";
  } else if (data.sizeOrVolume) {
    serviceName = `${data.sizeOrVolume} Dumpster Rental`;
  }

  const currentStep = funnelState.currentStep || "intent_selection";

  // Step chains per funnel for progress indicators and remaining steps
  const FUNNEL_STEP_CHAINS = {
    dumpster_rental: ["location", "dumpster_size", "delivery_date", "checkout"],
    junk_removal: ["scope", "location", "volume", "timing", "photos", "checkout"],
    tree_service: ["tree_need", "location", "job_description", "timing_urgency", "photos", "checkout"],
    porta_potty: ["use_case", "location", "unit_count", "start_date", "duration", "checkout"],
    commercial_builder: ["trade_account_form", "checkout"],
    contractor_professional: ["contractor_action", "trade_account_form", "checkout"],
  };

  const STEP_FRIENDLY_LABELS = {
    intent_selection: "Start Booking",
    service_selection: "Choose Service",
    location: "Jobsite Location",
    dumpster_size: "Dumpster Size",
    delivery_date: "Delivery Date",
    scope: "Project Scope",
    volume: "Estimated Volume",
    timing: "Preferred Timing",
    photos: "Upload Photos",
    tree_need: "Tree Service Type",
    job_description: "Job Details",
    timing_urgency: "Urgency",
    use_case: "Use Case",
    unit_count: "Number of Units",
    start_date: "Delivery Date",
    duration: "Rental Duration",
    trade_account_form: "Trade Account Form",
    checkout: "Checkout",
  };

  const formatStep = (step) => {
    if (!step) return "";
    return STEP_FRIENDLY_LABELS[step] || formatFriendlyLabel(step);
  };

  const chain = FUNNEL_STEP_CHAINS[funnelState.currentFunnel] || ["service_selection", "location", "checkout"];
  const stepIdx = chain.indexOf(currentStep);
  const currentStepIndex = stepIdx >= 0 ? stepIdx + 1 : 1;
  const totalSteps = chain.length;

  let remaining = [];
  if (stepIdx >= 0 && stepIdx < chain.length - 1) {
    remaining = chain.slice(stepIdx + 1).map((s) => formatStep(s));
  } else if (Array.isArray(funnelState.missingFields) && funnelState.missingFields.length > 0) {
    remaining = funnelState.missingFields.map((f) => formatStep(f));
  }

  return {
    hasUnfinishedBooking: true,
    serviceName: formatFriendlyLabel(serviceName),
    funnel: funnelState.currentFunnel,
    currentFunnel: funnelState.currentFunnel,
    currentStep,
    currentStepLabel: formatStep(currentStep),
    currentStepIndex,
    totalSteps,
    remainingSteps: remaining,
    remainingStepsCount: remaining.length,
    collectedData: data,
  };
}

export default {
  extractEntitiesFromMessage,
  calculateFunnelStep,
  generateStepActionCard,
  updateSessionFunnelState,
  getSessionFunnelState,
  getUnfinishedBookingSummary,
  getLiveDumpsterSizes,
  normalizeDate,
  PRIMARY_INTENT_OPTIONS,
  SERVICE_SELECTION_OPTIONS,
  DEFAULT_DUMPSTER_SIZES,
};
