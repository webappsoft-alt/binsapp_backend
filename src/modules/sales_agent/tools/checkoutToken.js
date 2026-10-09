import crypto from "node:crypto";
import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";
import { normalizeSalesServiceType } from "../../../models/SalesLead.js";
import SalesConversation from "../../../models/SalesConversation.js";
import { getLiveDumpsterSizes } from "../funnel/funnelState.service.js";
import { resolveZipCoordinates } from "../services/realAvailability.service.js";

const CHECKOUT_TOKEN_TTL_SECONDS = 1800; // 30 Minutes
const KEY_PREFIX = "sales:checkout:token:";
const BASE_FRONTEND_URL = process.env.REDIRECT_FRONTEND_URL || "https://www.binsapp.ai";

// Geocoding centroids for popular / tested metro zip codes
const ZIP_CENTROIDS = {
  "78701": { city: "Austin", state: "TX", lat: 30.2672, lng: -97.7431 },
  "33101": { city: "Miami", state: "FL", lat: 25.7743, lng: -80.1937 },
  "10001": { city: "New York", state: "NY", lat: 40.7501, lng: -73.9996 },
  "90001": { city: "Los Angeles", state: "CA", lat: 33.9736, lng: -118.2468 },
  "60601": { city: "Chicago", state: "IL", lat: 41.8864, lng: -87.6267 },
  "75001": { city: "Dallas", state: "TX", lat: 32.9612, lng: -96.8378 },
  "94102": { city: "San Francisco", state: "CA", lat: 37.7749, lng: -122.4194 },
};

/**
 * Maps standard service types to frontend route slugs
 * @param {string} serviceType
 * @returns {string}
 */
export function getServiceRouteSlug(serviceType) {
  const normalized = normalizeSalesServiceType(serviceType);
  const map = {
    Dumbster: "dumpster-rental",
    "Porta Potty": "porta-potty",
    "Junk Removal": "junk-removal",
    "Tree Removal": "tree-removal",
  };
  return map[normalized] || "dumpster-rental";
}

/**
 * Generates a secure, 30-minute prefilled checkout token stored in Redis
 * and returns the actionable URL for instant zero-double-entry checkout handoff.
 *
 * @param {Object} payload - Pre-filled booking data
 * @param {string} payload.serviceType
 * @param {string} [payload.sizeOrVolume]
 * @param {string} payload.zipCode
 * @param {string} [payload.deliveryAddress]
 * @param {string} [payload.city]
 * @param {string} [payload.state]
 * @param {number} [payload.lat]
 * @param {number} [payload.lng]
 * @param {string} [payload.deliveryDate]
 * @param {string} [payload.customerName]
 * @param {string} [payload.customerPhone]
 * @param {string} [payload.customerEmail]
 * @param {string} [payload.notes]
 * @param {string} [payload.useCase]
 * @param {string} [payload.units]
 * @param {string} [payload.duration]
 * @param {number} [payload.estimatedPrice]
 * @param {Array<string>} [payload.imageUrls]
 * @param {string} [payload.leadId]
 * @returns {Promise<{ token: string, ref_token: string, checkoutUrl: string, expiresAt: string, summary: Object, sessionData: Object }>}
 */
export async function createPrefilledCheckoutToken(payload = {}) {
  const token = crypto.randomBytes(16).toString("hex");
  const cacheKey = `${KEY_PREFIX}${token}`;

  const normalizedService = normalizeSalesServiceType(payload.serviceType);
  const zip = payload.zipCode ? String(payload.zipCode).trim() : "";

  let resolvedCity = payload.city || "";
  let resolvedState = payload.state || "";
  let resolvedLat = payload.lat != null ? Number(payload.lat) : null;
  let resolvedLng = payload.lng != null ? Number(payload.lng) : null;

  // Dynamically resolve coordinates using real geocoder
  if ((resolvedLat == null || resolvedLng == null) && zip) {
    const geo = await resolveZipCoordinates(zip);
    if (geo) {
      resolvedLat = geo.latitude;
      resolvedLng = geo.longitude;
      if (!resolvedCity) resolvedCity = geo.city;
      if (!resolvedState) resolvedState = geo.state;
    }
  }

  // Fallback to static centroids if any
  if (resolvedLat == null && ZIP_CENTROIDS[zip]) {
    resolvedLat = ZIP_CENTROIDS[zip].lat;
    resolvedLng = ZIP_CENTROIDS[zip].lng;
    if (!resolvedCity) resolvedCity = ZIP_CENTROIDS[zip].city;
    if (!resolvedState) resolvedState = ZIP_CENTROIDS[zip].state;
  }

  // If estimatedPrice is not explicitly provided, resolve from availableSizes or live inventory for Dumpster
  let resolvedPrice = payload.estimatedPrice != null ? Number(payload.estimatedPrice) : null;
  if (resolvedPrice == null && normalizedService === "Dumbster" && payload.sizeOrVolume) {
    try {
      const sizeStr = String(payload.sizeOrVolume).toLowerCase();
      const sizesList =
        Array.isArray(payload.availableSizes) && payload.availableSizes.length > 0
          ? payload.availableSizes
          : await getLiveDumpsterSizes();

      const matched = sizesList.find((s) => {
        const sLower = (s.size || "").toLowerCase();
        if (sizeStr.includes("30") && sLower.includes("30")) return true;
        if ((sizeStr.includes("20") || sizeStr.includes("18")) && (sLower.includes("20") || sLower.includes("18"))) return true;
        if (sizeStr.includes("40") && sLower.includes("40")) return true;
        if ((sizeStr.includes("10") || sizeStr.includes("12") || sizeStr.includes("6") || sizeStr.includes("8")) && (sLower.includes("10") || sLower.includes("12") || sLower.includes("6-8"))) return true;
        return false;
      });
      if (matched && (matched.startingPrice || matched.threeDaysPrice || matched.price)) {
        resolvedPrice = matched.startingPrice || matched.threeDaysPrice || matched.price;
      }
    } catch (e) {
      logger.warn("Error resolving live dumpster price for checkout token:", e?.message);
    }
  }

  const sessionData = {
    token,
    ref_token: token,
    serviceType: normalizedService,
    sizeOrVolume: payload.sizeOrVolume || payload.junkVolume || "",
    junkVolume: payload.junkVolume || payload.sizeOrVolume || "",
    treeNeed: payload.treeNeed || "",
    urgency: payload.urgency || payload.treeUrgency || "",
    zipCode: zip,
    address: payload.address || payload.deliveryAddress || (zip ? `ZIP Code ${zip}` : ""),
    deliveryAddress: payload.deliveryAddress || payload.address || (zip ? `ZIP Code ${zip}` : ""),
    city: resolvedCity,
    state: resolvedState,
    lat: resolvedLat,
    lng: resolvedLng,
    customerName: payload.customerName || payload.name || "",
    customerPhone: payload.customerPhone || payload.phone || "",
    customerEmail: payload.customerEmail || payload.email || "",
    deliveryDate: payload.deliveryDate || null,
    notes: payload.notes || payload.projectDescription || payload.jobDescription || "",
    useCase: payload.useCase || payload.projectType || "",
    units: payload.units || payload.sizeOrVolume || "",
    duration: payload.duration || "",
    estimatedPrice: resolvedPrice,
    junkAnalysis: payload.junkAnalysis || null,
    treeAnalysis: payload.treeAnalysis || null,
    manualReviewRequired: Boolean(
      payload.manualReviewRequired ||
      payload.treeAnalysis?.pricing_result?.manual_review_required ||
      payload.junkAnalysis?.pricing_result?.manual_review_required
    ),
    manualReviewReasons:
      payload.manualReviewReasons ||
      payload.treeAnalysis?.pricing_result?.manual_review_reasons ||
      payload.junkAnalysis?.pricing_result?.manual_review_reasons ||
      [],
    imageUrls: Array.isArray(payload.imageUrls) ? payload.imageUrls : (Array.isArray(payload.photos) ? payload.photos : []),
    createdAt: new Date().toISOString(),
  };

  const manualReviewRequired = Boolean(
    sessionData.manualReviewRequired ||
    sessionData.treeAnalysis?.pricing_result?.manual_review_required ||
    sessionData.junkAnalysis?.pricing_result?.manual_review_required
  );
  const manualReviewReasons =
    sessionData.manualReviewReasons?.length
      ? sessionData.manualReviewReasons
      : sessionData.treeAnalysis?.pricing_result?.manual_review_reasons ||
        sessionData.junkAnalysis?.pricing_result?.manual_review_reasons ||
        [];

  try {
    await redis.set(
      cacheKey,
      JSON.stringify(sessionData),
      "EX",
      CHECKOUT_TOKEN_TTL_SECONDS
    );
  } catch (redisError) {
    logger.error("Failed to store checkout token in Redis:", redisError);
  }

  const slug = getServiceRouteSlug(normalizedService);
  const searchParams = new URLSearchParams();
  searchParams.set("ref_token", token);
  if (sessionData.zipCode) searchParams.set("zip", sessionData.zipCode);
  if (sessionData.deliveryAddress || sessionData.address) {
    searchParams.set("address", sessionData.deliveryAddress || sessionData.address);
  }
  if (sessionData.city) searchParams.set("city", sessionData.city);
  if (sessionData.state) searchParams.set("state", sessionData.state);
  if (sessionData.lat != null && sessionData.lng != null) {
    searchParams.set("lat", String(sessionData.lat));
    searchParams.set("lng", String(sessionData.lng));
  }
  if (sessionData.sizeOrVolume) searchParams.set("size", sessionData.sizeOrVolume);
  if (sessionData.deliveryDate) searchParams.set("date", sessionData.deliveryDate);
  if (sessionData.treeNeed) searchParams.set("need", sessionData.treeNeed);
  if (sessionData.urgency) searchParams.set("urgency", sessionData.urgency);

  const checkoutUrl = `${BASE_FRONTEND_URL}/book/${slug}?${searchParams.toString()}`;

  return {
    token,
    ref_token: token,
    checkoutUrl,
    expiresAt: new Date(Date.now() + CHECKOUT_TOKEN_TTL_SECONDS * 1000).toISOString(),
    summary: {
      serviceType: sessionData.serviceType,
      sizeOrVolume: sessionData.sizeOrVolume,
      treeNeed: sessionData.treeNeed,
      urgency: sessionData.urgency,
      items: sessionData.notes,
      zipCode: sessionData.zipCode,
      address: sessionData.address || sessionData.deliveryAddress,
      deliveryAddress: sessionData.deliveryAddress || sessionData.address,
      city: sessionData.city,
      state: sessionData.state,
      lat: sessionData.lat,
      lng: sessionData.lng,
      estimatedPrice: sessionData.estimatedPrice,
      deliveryDate: sessionData.deliveryDate,
      photosCount: sessionData.imageUrls.length,
      hasAiAnalysis: Boolean(sessionData.junkAnalysis || sessionData.treeAnalysis),
      manualReviewRequired,
      manualReviewReasons,
    },
    sessionData,
  };
}

/**
 * Resolves a checkout session by token from Redis, with automatic
 * sessionBuffer / SalesConversation fallback for chk_<sessionId> tokens.
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
export async function getCheckoutSession(token) {
  if (!token) return null;
  const cacheKey = `${KEY_PREFIX}${token}`;
  try {
    const raw = await redis.get(cacheKey);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    logger.error(`Error resolving checkout token ${token}:`, err);
  }

  // Fallback: If token is `chk_${sessionId}` or contains uuid
  const sessionId = token.replace(/^chk_/, "");
  if (sessionId) {
    try {
      // 1. Try reading funnel_state from Redis
      const fsRaw = await redis.get(`sales:session:${sessionId}:funnel_state`);
      let collectedData = null;
      if (fsRaw) {
        try {
          const fsParsed = JSON.parse(fsRaw);
          collectedData = fsParsed?.collectedData || null;
        } catch {
          /* ignore parse error */
        }
      }

      // 2. Try reading meta from Redis
      if (!collectedData) {
        const metaRaw = await redis.get(`sales:session:${sessionId}:meta`);
        if (metaRaw) {
          try {
            const metaParsed = JSON.parse(metaRaw);
            collectedData = metaParsed?.collectedData || null;
          } catch {
            /* ignore parse error */
          }
        }
      }

      // 3. Fallback to MongoDB SalesConversation
      if (!collectedData) {
        const conv = await SalesConversation.findOne({ sessionId }).lean();
        collectedData = conv?.collectedData || null;
      }

      if (collectedData) {
        const zip = collectedData.zipCode ? String(collectedData.zipCode).trim() : "";
        const normalizedService = normalizeSalesServiceType(
          collectedData.serviceType || "Dumbster"
        );

        const resolvedAddress =
          collectedData.address ||
          collectedData.deliveryAddress ||
          (zip ? `ZIP Code ${zip}` : "");

        const sessionData = {
          token,
          ref_token: token,
          serviceType: normalizedService,
          sizeOrVolume: collectedData.sizeOrVolume || "",
          zipCode: zip,
          address: resolvedAddress,
          deliveryAddress: resolvedAddress,
          city: collectedData.city || "",
          state: collectedData.state || "",
          lat: collectedData.lat != null ? Number(collectedData.lat) : null,
          lng: collectedData.lng != null ? Number(collectedData.lng) : null,
          customerName:
            collectedData.contactName || collectedData.name || "",
          customerPhone: collectedData.phone || "",
          customerEmail: collectedData.email || "",
          deliveryDate: collectedData.deliveryDate || null,
          notes:
            collectedData.notes || collectedData.projectDescription || "",
          useCase:
            collectedData.useCase ||
            collectedData.projectType ||
            collectedData.businessType ||
            "",
          units: collectedData.units || collectedData.sizeOrVolume || "",
          duration:
            collectedData.duration || collectedData.serviceFrequency || 1,
          estimatedPrice: collectedData.estimatedPrice || null,
          junkAnalysis: collectedData.junkAnalysis || null,
          treeAnalysis: collectedData.treeAnalysis || null,
          imageUrls: collectedData.imageUrls || collectedData.photos || [],
        };

        // Cache into Redis for 30 minutes so subsequent calls are instant
        try {
          await redis.set(
            cacheKey,
            JSON.stringify(sessionData),
            "EX",
            CHECKOUT_TOKEN_TTL_SECONDS
          );
        } catch {
          /* ignore cache write error */
        }

        return sessionData;
      }
    } catch (err) {
      logger.error(
        `Error resolving checkout session from session buffer for ${token}:`,
        err
      );
    }
  }

  return null;
}

export default {
  createPrefilledCheckoutToken,
  getCheckoutSession,
  getServiceRouteSlug,
};
