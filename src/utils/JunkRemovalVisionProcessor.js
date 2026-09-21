import OpenAI from 'openai';
import logger from '../config/logger.js';
import env from '../config/env.js';
import JunkRemovalAdminConfiguration from '../models/JunkRemovalAdminConfiguration.js';

// Lazy client — constructed only on first use to avoid crashing boot
// when OpenAIApiKey is not yet set in the environment.
let openai = null;
function getOpenAIClient() {
  if (openai) return openai;
  const apiKey = env.get('OpenAIApiKey');
  if (!apiKey) {
    throw new Error(
      'OpenAIApiKey is not configured. Junk removal vision analysis is unavailable.',
    );
  }
  openai = new OpenAI({ apiKey });
  return openai;
}

/**
 * System Prompt — strict JSON extraction for Junk Removal site analysis.
 */
const SYSTEM_PROMPT = `
You are an expert junk removal assessment AI. Analyze the provided images of a junk removal job site.
Estimate the total volume in cubic yards, the combined weight in pounds, identify the primary item types,
assess access difficulty, and flag any hazardous or special-handling requirements.
Return your findings strictly in the JSON schema requested.

If images are unclear, poorly lit, or ambiguous, return a lower confidence_score and flag appropriate hazards.
`;

/**
 * Pricing Engine — calculates total quote from AI output using live admin config.
 *
 * Formula:
 *   subtotal = base_price (volume tier) + weight_add_on + access_add_on + hazard_sum
 *   raw_quote = round(subtotal * item_type_multiplier)
 *   final_quote = max(raw_quote, min_price_floor)
 *
 * @param {Object} aiData       - Structured output from OpenAI Vision
 * @param {Object} adminConfig  - Active JunkRemovalAdminConfiguration document
 * @param {string} region       - Region key, default "global"
 * @returns {Object}            - Full quote breakdown + manual review status
 */
export const calculateJunkRemovalQuote = (aiData, adminConfig, region = 'global') => {
  const {
    estimated_cubic_yards = 0,
    estimated_weight_lbs = 0,
    primary_item_type = 'unknown',
    access_level = 'ground_floor',
    stairs_flights = 0,
    hazards = [],
    is_same_day = false,
    confidence_score = 100,
  } = aiData;

  const globalRules = adminConfig.global_rules || { min_price_floor: 150, max_instant_quote: 2500 };
  const manualReviewTriggers = [];

  // A) Volume Tier → Base Price
  const volumeTiers = adminConfig.volume_tiers || [];
  const matchedVolumeTier = volumeTiers.find(
    (t) => estimated_cubic_yards >= t.min_cubic_yards && estimated_cubic_yards <= t.max_cubic_yards,
  );
  let basePrice = matchedVolumeTier ? matchedVolumeTier.base_price : 0;
  if (matchedVolumeTier?.trigger_manual_review) {
    manualReviewTriggers.push(
      `Load volume (${estimated_cubic_yards} cy) exceeds instant-quote threshold`,
    );
  }
  if (!matchedVolumeTier && volumeTiers.length > 0) {
    // Volume exceeds all tiers — use highest tier price and flag review
    const highestTier = [...volumeTiers].sort((a, b) => b.max_cubic_yards - a.max_cubic_yards)[0];
    basePrice = highestTier.base_price;
    manualReviewTriggers.push(`Load volume (${estimated_cubic_yards} cy) is outside configured tiers`);
  }

  // B) Weight Tier → Add-on Fee
  const weightTiers = adminConfig.weight_tiers || [];
  const matchedWeightTier = weightTiers.find(
    (t) => estimated_weight_lbs >= t.min_lbs && estimated_weight_lbs <= t.max_lbs,
  );
  let weightAddOn = matchedWeightTier ? matchedWeightTier.add_on_fee : 0;
  if (matchedWeightTier?.trigger_manual_review) {
    manualReviewTriggers.push(
      `Estimated weight (${estimated_weight_lbs} lbs) triggers manual review`,
    );
  }

  // C) Item Type Multiplier
  const typeConfig = adminConfig.item_type_multipliers?.[0] || {};
  const multiplier = typeConfig[primary_item_type] ?? (typeConfig.unknown || 1.1);

  // D) Access Fees (additive)
  const accessConfig = adminConfig.access_fees?.[0] || {};
  let accessAddOn = accessConfig[access_level] ?? 0;
  // Stairs are per-flight on top of any base access fee
  if (access_level === 'stairs' && stairs_flights > 0) {
    const perFlight = accessConfig.stairs_per_flight ?? 50;
    accessAddOn = Math.round(perFlight * stairs_flights);
  }

  // E) Hazard Fees (summable)
  const hazardConfig = adminConfig.hazard_fees?.[0] || {};
  let hazardSum = 0;
  hazards.forEach((hazardKey) => {
    if (hazardKey === 'trigger_manual_review' || hazardConfig.trigger_manual_review) {
      manualReviewTriggers.push('Hazardous conditions require manual review');
    } else if (typeof hazardConfig[hazardKey] === 'number') {
      hazardSum += hazardConfig[hazardKey];
    }
  });

  // Same-day surcharge
  if (is_same_day && typeof hazardConfig.same_day_dispatch === 'number') {
    hazardSum += hazardConfig.same_day_dispatch;
  }

  // F) Compute Final Quote
  const subtotal = basePrice + weightAddOn + accessAddOn + hazardSum;
  const rawQuote = Math.round(subtotal * multiplier);
  const finalQuote = Math.max(rawQuote, globalRules.min_price_floor);

  // Cap → manual review
  if (finalQuote >= globalRules.max_instant_quote) {
    manualReviewTriggers.push(
      `Calculated quote ($${finalQuote}) exceeds max instant-quote limit ($${globalRules.max_instant_quote})`,
    );
  }

  // Low AI confidence → manual review (same threshold as TreeRemoval)
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
      weight_add_on: weightAddOn,
      access_add_on: accessAddOn,
      hazard_sum: hazardSum,
      item_type_multiplier: multiplier,
    },
  };
};

/**
 * Background orchestrator — sends Firebase image URLs to OpenAI Vision,
 * runs the pricing engine, and returns the combined result.
 *
 * No fallback config: if no JunkRemovalAdminConfiguration exists in the DB,
 * an error is thrown so the operator knows to seed the configuration first.
 *
 * @param {string[]} imageUrls  - Firebase Storage public URLs (max 5)
 * @param {string}   region     - Optional region key (default "global")
 * @returns {Promise<Object>}   - { ai_detection, pricing_result }
 */
export const processJunkAnalysisInBackground = async (imageUrls, region = 'global') => {
  try {
    // 1. Fetch active admin configuration — no fallback, config must exist in DB
    const adminConfig = await JunkRemovalAdminConfiguration.findOne().lean();
    if (!adminConfig) {
      throw new Error(
        'No JunkRemovalAdminConfiguration found in the database. ' +
        'Please seed the configuration via PUT /api/admin/junk-removal-config before using AI analysis.',
      );
    }

    // 2. Build OpenAI Vision image content blocks (max 5 images, high detail)
    const imageContentBlocks = imageUrls.slice(0, 5).map((url) => ({
      type: 'image_url',
      image_url: {
        url,
        detail: 'high', // Maximum precision for item identification and volume estimation
      },
    }));

    // 3. Execute OpenAI Vision request with structured JSON output
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze these junk removal job site images and return a JSON object with exactly these keys:
              {
                "estimated_cubic_yards": number,
                "estimated_weight_lbs": number,
                "item_types": ["household" | "furniture" | "construction" | "electronics" | "mixed" | "unknown"],
                "primary_item_type": "household" | "furniture" | "construction" | "electronics" | "mixed" | "unknown",
                "access_level": "ground_floor" | "stairs" | "elevator" | "long_carry",
                "stairs_flights": number,
                "hazards": ["hazardous_materials" | "heavy_lift_required" | "requires_permits"],
                "is_same_day": boolean,
                "confidence_score": number (0 to 100),
                "equipment_recommendations": ["string"],
                "item_breakdown": [{ "name": "string", "quantity": number, "estimated_cubic_yards": number }],
                "manual_review_reasons": ["string"]
              }

              Guidelines:
              - estimated_cubic_yards: total volume of all visible junk (1 pickup truck load ≈ 2–3 cy)
              - estimated_weight_lbs: total estimated weight of all items
              - primary_item_type: the dominant category driving cost
              - access_level: how hard is it to carry items to the truck
              - stairs_flights: only if access_level is "stairs", how many flights
              - hazards: list only confirmed hazards; omit if none present
              - confidence_score: your certainty based on image quality and item visibility`,
            },
            ...imageContentBlocks,
          ],
        },
      ],
      temperature: 0.2,
    });

    const parsedAnalysis = JSON.parse(response.choices[0].message.content);

    // 4. Run Pricing Engine using live admin config
    const pricingResult = calculateJunkRemovalQuote(parsedAnalysis, adminConfig, region);

    // 5. Merge manual review reasons (AI-detected + pricing-engine triggers), deduplicated
    const allManualReviewReasons = [
      ...(parsedAnalysis.manual_review_reasons || []),
      ...(pricingResult.manual_review_reasons || []),
    ];
    pricingResult.manual_review_reasons = [...new Set(allManualReviewReasons)];
    pricingResult.manual_review_required =
      pricingResult.manual_review_required || pricingResult.manual_review_reasons.length > 0;

    logger.info('✅ Junk Removal Background Analysis & Pricing Engine Executed Successfully');

    return {
      ai_detection: parsedAnalysis,
      pricing_result: pricingResult,
    };
  } catch (error) {
    logger.error('❌ Error in Junk Removal Vision AI processing:', error);
    throw new Error(`Junk Removal Vision AI Processing Failed: ${error.message}`);
  }
};
