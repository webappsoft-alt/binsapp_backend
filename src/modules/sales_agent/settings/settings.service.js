import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";

const SETTINGS_KEY = "sales:settings:config";

const DEFAULT_SETTINGS = {
  greetingMessage:
    "Hi there! 👋 Looking for a dumpster, porta potty, junk removal, or tree service? I can get you instant pricing and size recommendations.",
  inactivityThresholdMinutes: 15,
  autoCheckoutEnabled: true,
  handoffEnabled: true,
  proactiveGreetingDelaySeconds: 5,
  enabledServices: ["Dumbster", "Porta Potty", "Junk Removal", "Tree Removal"],
};

/**
 * Retrieves the current AI Sales Agent runtime settings
 * @returns {Promise<Object>}
 */
export async function getSalesAgentSettings() {
  try {
    const raw = await redis.get(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    logger.warn("Error fetching sales agent settings from Redis:", err?.message);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Updates AI Sales Agent runtime settings in Redis
 * @param {Object} newSettings
 * @returns {Promise<Object>} Updated settings
 */
export async function updateSalesAgentSettings(newSettings = {}) {
  const current = await getSalesAgentSettings();
  const updated = {
    ...current,
    ...newSettings,
    updatedAt: new Date().toISOString(),
  };

  try {
    await redis.set(SETTINGS_KEY, JSON.stringify(updated));
  } catch (err) {
    logger.error("Error saving sales agent settings to Redis:", err);
  }

  return updated;
}

export default {
  getSalesAgentSettings,
  updateSalesAgentSettings,
  DEFAULT_SETTINGS,
};
