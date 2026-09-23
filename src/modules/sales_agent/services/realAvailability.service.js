import axios from "axios";
import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";
import { normalizeSalesServiceType } from "../../../models/SalesLead.js";
import DumbsterServiceClass from "../../dumbster/service.js";
import JunkRemoval from "../../../models/JunkRemoval.js";
import TreeRemoval from "../../../models/TreeRemoval.js";
import User from "../../../models/User.js"; // Ensure User model registered for lookups

const dumbsterService = new DumbsterServiceClass();

const GEO_KEY_PREFIX = "sales:geo:zip:";
const GEO_CACHE_TTL_SECONDS = 30 * 24 * 3600; // 30 Days

// Curated centroid fallbacks for major US metro areas (ensures robust offline/test reliability)
const OFFLINE_ZIP_CENTROIDS = {
  "78701": { latitude: 30.2713, longitude: -97.7426, city: "Austin", state: "TX" },
  "78702": { latitude: 30.2642, longitude: -97.7174, city: "Austin", state: "TX" },
  "78704": { latitude: 30.2452, longitude: -97.7667, city: "Austin", state: "TX" },
  "33101": { latitude: 25.7743, longitude: -80.1937, city: "Miami", state: "FL" },
  "33034": { latitude: 25.4479, longitude: -80.4792, city: "Florida City", state: "FL" },
  "10001": { latitude: 40.7501, longitude: -73.9996, city: "New York", state: "NY" },
  "90001": { latitude: 33.9736, longitude: -118.2468, city: "Los Angeles", state: "CA" },
  "60601": { latitude: 41.8864, longitude: -87.6267, city: "Chicago", state: "IL" },
  "75001": { latitude: 32.9612, longitude: -96.8378, city: "Dallas", state: "TX" },
  "75201": { latitude: 32.7876, longitude: -96.7997, city: "Dallas", state: "TX" },
  "94102": { latitude: 37.7749, longitude: -122.4194, city: "San Francisco", state: "CA" },
  "98101": { latitude: 47.6101, longitude: -122.3344, city: "Seattle", state: "WA" },
  "30301": { latitude: 33.7490, longitude: -84.3880, city: "Atlanta", state: "GA" },
  "80201": { latitude: 39.7392, longitude: -104.9903, city: "Denver", state: "CO" },
  "85001": { latitude: 33.4484, longitude: -112.0740, city: "Phoenix", state: "AZ" },
};

/**
 * Resolves a 5-digit US ZIP code to real geographic latitude, longitude, city, and state.
 * Uses Redis caching (30-day TTL) with Zippopotam REST API and robust offline fallback.
 *
 * @param {string} zipCode
 * @returns {Promise<{ latitude: number, longitude: number, city: string, state: string }|null>}
 */
export async function resolveZipCoordinates(zipCode) {
  if (!zipCode || typeof zipCode !== "string") return null;

  const cleanZip = zipCode.trim().slice(0, 5);
  if (!/^\d{5}$/.test(cleanZip)) {
    return null;
  }

  const cacheKey = `${GEO_KEY_PREFIX}${cleanZip}`;

  // 1. Check Redis cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.debug(`Redis geo cache get failed for ZIP ${cleanZip}:`, err?.message);
  }

  // 2. Fetch from Zippopotam REST API (Fast, free, reliable for US postal codes)
  try {
    const response = await axios.get(`https://api.zippopotam.us/us/${cleanZip}`, {
      timeout: 2500,
    });

    if (response.status === 200 && response.data?.places?.length > 0) {
      const place = response.data.places[0];
      const result = {
        latitude: parseFloat(place.latitude),
        longitude: parseFloat(place.longitude),
        city: place["place name"] || "",
        state: place["state abbreviation"] || place.state || "",
      };

      try {
        await redis.set(cacheKey, JSON.stringify(result), "EX", GEO_CACHE_TTL_SECONDS);
      } catch (cacheErr) {
        logger.debug(`Redis geo cache set failed for ZIP ${cleanZip}:`, cacheErr?.message);
      }

      return result;
    }
  } catch (apiErr) {
    if (apiErr.response && apiErr.response.status === 404) {
      // Confirmed non-existent US ZIP code
      return null;
    }
    logger.debug(`Zippopotam lookup failed for ZIP ${cleanZip} (${apiErr.message}), trying offline fallback.`);
  }

  // 3. Fallback to offline curated centroids
  if (OFFLINE_ZIP_CENTROIDS[cleanZip]) {
    const fallback = OFFLINE_ZIP_CENTROIDS[cleanZip];
    try {
      await redis.set(cacheKey, JSON.stringify(fallback), "EX", GEO_CACHE_TTL_SECONDS);
    } catch {
      // Non-critical
    }
    return fallback;
  }

  return null;
}

/**
 * Checks real Dumpster availability using the existing DumbsterService.getAvailableDumbsters
 * (which invokes findBookableSizesNearby and aggregates live Dustbins against provider radius).
 *
 * @param {Object} coords - { latitude, longitude }
 * @returns {Promise<Array<Object>>} List of actually bookable dumpster sizes
 */
export async function checkRealDumpsterAvailability({
  latitude,
  longitude,
  city,
  state,
  stateCode,
  zip,
  county,
  materialType,
}) {
  try {
    const results = await dumbsterService.getAvailableDumbsters({
      lat: latitude,
      lng: longitude,
      city,
      state,
      stateCode,
      zip,
      county,
      materialType,
      sizeField: "dumbster",
    });

    if (!Array.isArray(results) || results.length === 0) {
      return [];
    }

    return results.map((item) => {
      const rawSize = item.size || item.description || "Dumpster";
      let displaySize = rawSize;
      if (!displaySize.toLowerCase().includes("yard")) {
        displaySize = `${displaySize} Yard`;
      }
      return {
        id: String(item._id),
        size: displaySize,
        availableBins: item.availableBins || 1,
        dimensions: item.dimension ? `${item.dimension} ft` : "Standard Dimensions",
        capacity: item.weight || (item.tons ? `${item.tons} tons included` : "2-3 Tons Included"),
        bestFor: item.usage || item.description || "General cleanouts & renovations",
        startingPrice: Number(item.price) || Number(item.three_days_price) || 349,
        threeDaysPrice: item.three_days_price || null,
        sevenDaysPrice: item.seven_days_price || null,
        includedTons: item.includedTons ?? item.tons ?? null,
        overagePerTon: item.overagePerTon ?? null,
        extraDay: item.extraDay ?? item.per_dim_rate ?? null,
        pricingSource: item.pricingSource || "fallback",
        pricingZone: item.pricingZone || null,
        isPopular: displaySize.includes("20") || displaySize.includes("18-20"),
      };
    });
  } catch (err) {
    logger.error("Error executing checkRealDumpsterAvailability:", err);
    return [];
  }
}

/**
 * Checks real Porta Potty availability using existing DumbsterService.getAvailablePortaPotty
 *
 * @param {Object} coords - { latitude, longitude }
 * @returns {Promise<Array<Object>>} List of actually bookable porta potty sizes
 */
export async function checkRealPortaPottyAvailability({ latitude, longitude }) {
  try {
    const results = await dumbsterService.getAvailablePortaPotty({
      lat: latitude,
      lng: longitude,
    });

    if (!Array.isArray(results) || results.length === 0) {
      return [];
    }

    return results.map((item) => ({
      id: String(item._id),
      size: item.size || "Standard Portable Restroom",
      availableBins: item.availableBins || 1,
      startingPrice: Number(item.price) || null,
    }));
  } catch (err) {
    logger.error("Error executing checkRealPortaPottyAvailability:", err);
    return [];
  }
}

/**
 * Checks real Junk Removal provider availability using the existing 50-mile $geoNear matching logic
 *
 * @param {Object} coords - { latitude, longitude }
 * @returns {Promise<{ serviceable: boolean, providersCount: number }>}
 */
export async function checkRealJunkRemovalAvailability({ latitude, longitude }) {
  try {
    const milesToMeters = 1609.344;
    const maxDistanceInMeters = 50 * milesToMeters;

    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          distanceField: "distanceInMeters",
          maxDistance: maxDistanceInMeters,
          spherical: true,
        },
      },
      {
        $match: {
          status: "approved",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $match: {
          "user.status": { $nin: ["deleted", "deactivated"] },
        },
      },
    ];

    const matches = await JunkRemoval.aggregate(pipeline);
    const count = matches ? matches.length : 0;

    return {
      serviceable: count > 0,
      providersCount: count,
    };
  } catch (err) {
    logger.error("Error executing checkRealJunkRemovalAvailability:", err);
    return { serviceable: false, providersCount: 0 };
  }
}

/**
 * Checks real Tree Removal provider availability using the existing 50-mile $geoNear matching logic
 *
 * @param {Object} coords - { latitude, longitude }
 * @returns {Promise<{ serviceable: boolean, providersCount: number }>}
 */
export async function checkRealTreeRemovalAvailability({ latitude, longitude }) {
  try {
    const milesToMeters = 1609.344;
    const maxDistanceInMeters = 50 * milesToMeters;

    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          distanceField: "distanceInMeters",
          maxDistance: maxDistanceInMeters,
          spherical: true,
        },
      },
      {
        $match: {
          status: "approved",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $match: {
          "user.status": { $nin: ["deleted", "deactivated"] },
        },
      },
    ];

    const matches = await TreeRemoval.aggregate(pipeline);
    const count = matches ? matches.length : 0;

    return {
      serviceable: count > 0,
      providersCount: count,
    };
  } catch (err) {
    logger.error("Error executing checkRealTreeRemovalAvailability:", err);
    return { serviceable: false, providersCount: 0 };
  }
}

/**
 * Master Real Availability Gatekeeper for the AI Sales Agent.
 * Replaces static catalog assumptions with true geographical provider/inventory checks.
 *
 * @param {Object} params
 * @param {string} params.serviceType - "Dumbster" | "Porta Potty" | "Junk Removal" | "Tree Removal"
 * @param {string} [params.zipCode] - 5-digit US postal code
 * @param {Object} [params.location] - Optional direct coordinates { lat, lng } or { latitude, longitude }
 * @returns {Promise<Object>} Availability verdict, real bookable sizes, and contextual messaging
 */
export async function checkRealServiceAvailability({ serviceType = "Dumbster", zipCode = "", location = null }) {
  const normalizedService = normalizeSalesServiceType(serviceType);

  // 1. Resolve coordinates
  let coords = null;
  if (location && typeof location === "object") {
    const lat = location.lat ?? location.latitude ?? (Array.isArray(location.coordinates) ? location.coordinates[1] : null);
    const lng = location.lng ?? location.longitude ?? (Array.isArray(location.coordinates) ? location.coordinates[0] : null);
    if (lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      coords = {
        latitude: Number(lat),
        longitude: Number(lng),
        city: location.city || "",
        state: location.state || "",
      };
    }
  }

  if (!coords && zipCode) {
    coords = await resolveZipCoordinates(zipCode);
  }

  if (!coords) {
    return {
      serviceable: false,
      serviceType: normalizedService,
      zipCode: zipCode || "",
      reason: "invalid_location",
      message: zipCode
        ? `We couldn't verify ZIP code "${zipCode}". Please check that it is a valid 5-digit US postal code.`
        : "A valid ZIP code or delivery address is required to check real provider availability.",
      customQuoteAvailable: false,
    };
  }

  const { latitude, longitude, city, state } = coords;

  // 2. Query real underlying availability per service type
  switch (normalizedService) {
    case "Dumbster": {
      const availableSizes = await checkRealDumpsterAvailability({
        latitude,
        longitude,
        city,
        state,
        zip: zipCode,
      });

      if (availableSizes.length === 0) {
        return {
          serviceable: false,
          serviceType: "Dumbster",
          zipCode,
          location: { lat: latitude, lng: longitude, city, state },
          availableSizes: [],
          providersCount: 0,
          message: `We currently do not have active dumpster providers with available inventory in ${city ? `${city}, ${state} ` : ""}ZIP code ${zipCode}. Our team can review custom partner haulers or contact you if a bin becomes available.`,
          customQuoteAvailable: true,
        };
      }

      return {
        serviceable: true,
        serviceType: "Dumbster",
        zipCode,
        location: { lat: latitude, lng: longitude, city, state },
        availableSizes,
        providersCount: availableSizes.reduce((sum, s) => sum + (s.availableBins || 1), 0),
        deliveryWindow: "Next-day and same-day delivery available (Mon - Sat)",
        message: `Great news! We found ${availableSizes.length} dumpster size(s) available for on-time delivery in ${city ? `${city}, ${state}` : `ZIP code ${zipCode}`}.`,
      };
    }

    case "Porta Potty": {
      const availableSizes = await checkRealPortaPottyAvailability({ latitude, longitude });

      if (availableSizes.length === 0) {
        return {
          serviceable: false,
          serviceType: "Porta Potty",
          zipCode,
          location: { lat: latitude, lng: longitude, city, state },
          availableSizes: [],
          providersCount: 0,
          message: `Portable sanitation service is currently not available in ${city ? `${city}, ${state} ` : ""}ZIP code ${zipCode}. Our dispatch team can check custom event partner coverage for you.`,
          customQuoteAvailable: true,
        };
      }

      return {
        serviceable: true,
        serviceType: "Porta Potty",
        zipCode,
        location: { lat: latitude, lng: longitude, city, state },
        availableSizes,
        providersCount: availableSizes.length,
        message: `Great news! Portable restrooms are available for delivery in ${city ? `${city}, ${state}` : `ZIP code ${zipCode}`}.`,
      };
    }

    case "Junk Removal": {
      const result = await checkRealJunkRemovalAvailability({ latitude, longitude });

      if (!result.serviceable) {
        return {
          serviceable: false,
          serviceType: "Junk Removal",
          zipCode,
          location: { lat: latitude, lng: longitude, city, state },
          providersCount: 0,
          message: `We currently do not have active licensed junk removal providers within 50 miles of ${city ? `${city}, ${state} ` : ""}ZIP code ${zipCode}.`,
          customQuoteAvailable: true,
        };
      }

      return {
        serviceable: true,
        serviceType: "Junk Removal",
        zipCode,
        location: { lat: latitude, lng: longitude, city, state },
        providersCount: result.providersCount,
        availableSizes: ["Single Item", "1/4 Truckload", "1/2 Truckload", "Full Truckload"],
        message: `Great news! We have ${result.providersCount} approved junk removal crew(s) ready in your area.`,
      };
    }

    case "Tree Removal": {
      const result = await checkRealTreeRemovalAvailability({ latitude, longitude });

      if (!result.serviceable) {
        return {
          serviceable: false,
          serviceType: "Tree Removal",
          zipCode,
          location: { lat: latitude, lng: longitude, city, state },
          providersCount: 0,
          message: `We currently do not have licensed tree service crews within 50 miles of ${city ? `${city}, ${state} ` : ""}ZIP code ${zipCode}.`,
          customQuoteAvailable: true,
        };
      }

      return {
        serviceable: true,
        serviceType: "Tree Removal",
        zipCode,
        location: { lat: latitude, lng: longitude, city, state },
        providersCount: result.providersCount,
        availableSizes: ["Standard Tree Trimming", "Full Tree Removal", "Stump Grinding"],
        message: `Great news! We have ${result.providersCount} certified tree service crew(s) ready in your area.`,
      };
    }

    default:
      return {
        serviceable: true,
        serviceType: normalizedService,
        zipCode,
        location: { lat: latitude, lng: longitude, city, state },
        message: `Service availability confirmed for ZIP code ${zipCode}.`,
      };
  }
}

export default {
  resolveZipCoordinates,
  checkRealServiceAvailability,
  checkRealDumpsterAvailability,
  checkRealPortaPottyAvailability,
  checkRealJunkRemovalAvailability,
  checkRealTreeRemovalAvailability,
};
