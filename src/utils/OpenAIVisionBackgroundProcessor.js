import OpenAI from 'openai';
import logger from '../config/logger.js';
import env from '../config/env.js';
import TreeRemovalAdminConfiguration from '../models/TreeRemovalAdminConfiguration.js';

// Lazy client — do not construct at import time or missing AI_ASSESSMENT_API_KEY
// crashes the whole socket/API boot path (socket.js imports this module).
let openai = null;
function getOpenAIClient() {
  if (openai) return openai;
  const apiKey = env.get('OpenAIApiKey');
  if (!apiKey) {
    throw new Error(
      'AI_ASSESSMENT_API_KEY is not configured. Tree removal vision analysis is unavailable.',
    );
  }
  openai = new OpenAI({ apiKey });
  return openai;
}

/**
 * System Prompt enforcing strict JSON extraction for Tree Removal Analysis
 */
const SYSTEM_PROMPT = `
You are an expert arboricultural inspector AI. Analyze the provided images of a tree service job site.
Extract the required measurements, obstacles, and risk factors strictly in the JSON schema requested.

If images are unclear, low-lighting, or ambiguous, return lower confidence_score and flag high risk.
`;

/**
 * 1. Pricing Engine Function: Calculates total quote based on Admin DB Schema
 * @param {Object} aiParsedData - Object returned from OpenAI Vision
 * @param {Object} adminConfig - Active TreeRemovalAdminConfiguration document
 * @param {string} userRegion - Region name (default "global")
 * @returns {Object} Final quote breakdown and manual review status
 */
export const calculateTreeRemovalQuote = (aiParsedData, adminConfig, userRegion = 'global') => {
  const {
    estimated_height_ft = 0,
    estimated_dbh_in = 0,
    tree_type = 'standard',
    access_level = 'easy',
    hazards = [],
    confidence_score = 100,
    is_emergency_same_day = false,
  } = aiParsedData;

  const globalRules = adminConfig.global_rules || { min_price_floor: 450, max_instant_quote: 5000 };
  const manualReviewTriggers = [];

  // A) Height Tier Base Price
  const heightTiers = adminConfig.height_tiers || [];
  const matchedHeightTier = heightTiers.find(
    (tier) =>
      estimated_height_ft >= tier.minimum_height &&
      estimated_height_ft <= tier.maximum_height
  );

  let basePrice = matchedHeightTier ? matchedHeightTier.base_price : 0;
  if (matchedHeightTier?.trigger_manual_review) {
    manualReviewTriggers.push(`Tree height (${estimated_height_ft} ft) triggers manual review limit`);
  }

  // B) DBH (Diameter) Add-on Fee
  const dbhTiers = adminConfig.dbh_tiers || [];
  const matchedDbhTier = dbhTiers.find(
    (tier) =>
      estimated_dbh_in >= tier.minimum_diameter &&
      estimated_dbh_in <= tier.maximum_diameter
  );

  let dbhAddOn = matchedDbhTier ? matchedDbhTier.add_on_fee : 0;
  if (matchedDbhTier?.trigger_manual_review) {
    manualReviewTriggers.push(`Trunk diameter (${estimated_dbh_in} in) triggers manual review limit`);
  }

  // C) Tree Type Multiplier
  const typeConfig = adminConfig.type_multipliers?.[0] || {};
  const multiplier = typeConfig[tree_type] ?? (typeConfig.standard || 1.0);

  // D) Access Fee
  const accessConfig = adminConfig.access_fees?.[0] || {};
  const accessAddOn = accessConfig[access_level] ?? 0;

  // E) Hazard Fees Calculation
  const hazardConfig = adminConfig.hazard_fees?.[0] || {};
  let hazardSum = 0;

  hazards.forEach((hazardKey) => {
    if (hazardKey === 'crane_likely' && hazardConfig.crane_likely?.trigger_manual_review) {
      manualReviewTriggers.push('Crane or heavy specialized machinery likely required');
    } else if (typeof hazardConfig[hazardKey] === 'number') {
      hazardSum += hazardConfig[hazardKey];
    }
  });

  // Emergency hazard add-on check
  if (is_emergency_same_day && typeof hazardConfig.emergency_same_day === 'number') {
    hazardSum += hazardConfig.emergency_same_day;
  }

  // F) Formula Calculation
  // Formula: quote_raw = (base_price + dbh_add + access_add + hazard_sum) * type_multiplier
  const subtotal = basePrice + dbhAddOn + accessAddOn + hazardSum;
  const rawQuote = Math.round(subtotal * multiplier);

  // Apply Price Floor
  const finalQuote = Math.max(rawQuote, globalRules.min_price_floor);

  // Cap Limit Check
  if (finalQuote >= globalRules.max_instant_quote) {
    manualReviewTriggers.push(`Calculated quote ($${finalQuote}) exceeds maximum instant quote limit ($${globalRules.max_instant_quote})`);
  }

  // AI Low Confidence Check
  if (confidence_score < 70) {
    manualReviewTriggers.push(`Low AI image confidence score (${confidence_score}%)`);
  }

  const manualReviewRequired = manualReviewTriggers.length > 0;

  return {
    raw_quote: rawQuote,
    final_quote: finalQuote,
    min_price_floor_applied: finalQuote === globalRules.min_price_floor,
    manual_review_required: manualReviewRequired,
    manual_review_reasons: manualReviewTriggers,
    breakdown: {
      base_price: basePrice,
      dbh_add_on: dbhAddOn,
      access_add_on: accessAddOn,
      hazard_sum: hazardSum,
      type_multiplier: multiplier,
    },
  };
};

/**
 * 2. Background Worker Function to Process Firebase Image URLs via OpenAI Vision & Calculate Pricing
 * @param {Array<string>} imageUrls - Array of Firebase Storage URLs (Max 5)
 * @param {string} userRegion - Optional region key (default "global")
 * @returns {Promise<Object>} Aggregated AI Analysis & Calculated Pricing Payload
 */
export const processTreeAnalysisInBackground = async (imageUrls, userRegion = 'global') => {
  try {
    // 1. Fetch Admin Configuration from DB
    let adminConfig = await TreeRemovalAdminConfiguration.findOne().lean();

    if (!adminConfig) {
      logger.warn("⚠️ No TreeRemovalAdminConfiguration found in DB! Using default fallback object.");
      adminConfig = {
        global_rules: { min_price_floor: 450, max_instant_quote: 5000 },
        height_tiers: [
          { minimum_height: 0, maximum_height: 20, base_price: 450 },
          { minimum_height: 21, maximum_height: 40, base_price: 850 },
          { minimum_height: 41, maximum_height: 60, base_price: 1450 },
          { minimum_height: 61, maximum_height: 80, base_price: 2250 },
          { minimum_height: 81, maximum_height: 999, base_price: 3000, trigger_manual_review: true }
        ],
        dbh_tiers: [
          { minimum_diameter: 0, maximum_diameter: 12, add_on_fee: 0 },
          { minimum_diameter: 13, maximum_diameter: 24, add_on_fee: 150 },
          { minimum_diameter: 25, maximum_diameter: 36, add_on_fee: 350 },
          { minimum_diameter: 37, maximum_diameter: 48, add_on_fee: 650 },
          { minimum_diameter: 49, maximum_diameter: 999, add_on_fee: 1000, trigger_manual_review: true }
        ],
        type_multipliers: [{ standard: 1.0, hardwood: 1.15, palm: 1.1, unknown: 1.05 }],
        access_fees: [{ easy: 0, moderate: 200, difficult: 450 }],
        hazard_fees: [{ power_lines: 500, near_structure: 400, tight_drop_zone: 250, emergency_same_day: 250, crane_likely: { trigger_manual_review: true } }]
      };
    }

    // 2. Format Firebase Storage URLs into OpenAI Vision content payload
    const imageContentBlocks = imageUrls.slice(0, 5).map((url) => ({
      type: "image_url",
      image_url: {
        url: url,
        detail: "high" // Ensures maximum precision for hazards & trunk dimensions
      }
    }));

    // 3. Execute OpenAI Vision Request
    const response = await getOpenAIClient().chat.completions.create({
      model: "gpt-4o", // Industry standard for Vision & Structured Outputs
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze these tree images and return a JSON object with exact keys:
              {
                "estimated_height_ft": number,
                "estimated_dbh_in": number,
                "tree_type": "standard" | "hardwood" | "palm" | "unknown",
                "access_level": "easy" | "moderate" | "difficult",
                "hazards": ["power_lines", "near_structure", "tight_drop_zone", "crane_likely"],
                "confidence_score": number (0 to 100),
                "equipment_recommendations": ["string"],
                "estimated_debris_cubic_yards": number,
                "stump_grinding_detected": boolean,
                "manual_review_reasons": ["string"]
              }`
            },
            ...imageContentBlocks
          ]
        }
      ],
      temperature: 0.2
    });

    const parsedAnalysis = JSON.parse(response.choices[0].message.content);
    console.log(parsedAnalysis)

    // 4. Run Pricing Engine using Admin Config
    const pricingResult = calculateTreeRemovalQuote(parsedAnalysis, adminConfig, userRegion);
    console.log(pricingResult)

    // Combine manual review reasons from AI and Pricing calculation
    const allManualReviewReasons = [
      ...(parsedAnalysis.manual_review_reasons || []),
      ...(pricingResult.manual_review_reasons || [])
    ];

    pricingResult.manual_review_reasons = [...new Set(allManualReviewReasons)];
    pricingResult.manual_review_required = pricingResult.manual_review_required || pricingResult.manual_review_reasons.length > 0;

    logger.info("✅ Tree Removal Background Analysis & Pricing Engine Executed Successfully");

    return {
      ai_detection: parsedAnalysis,
      pricing_result: pricingResult
    };

  } catch (error) {
    logger.error("❌ Error in background Vision AI processing:", error);
    throw new Error(`Vision AI Processing Failed: ${error.message}`);
  }
};