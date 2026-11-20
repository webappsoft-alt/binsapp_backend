import logger from "../config/logger.js";
import { renderTemplateString } from "./templateEngine.js";

/**
 * In-memory cache of system templates an admin has customised in the Templates page.
 *
 * Email builders are synchronous, so they read this cache (refreshed every minute and right
 * after a template is saved) instead of hitting Mongo on every send. Until a template is
 * customised the code version is used unchanged.
 */
const REFRESH_MS = 60 * 1000;
let cache = new Map();
let lastLoad = 0;
let loading = null;

export async function loadTemplateOverrides() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const Template = (await import("../models/Template.js")).default;
      const rows = await Template.find({
        kind: "system",
        category: "email",
        isCustomized: true,
        isActive: true,
      })
        .select("key subject html subjectEditable")
        .lean();
      cache = new Map(rows.filter((r) => r.key && r.html).map((r) => [r.key, r]));
      lastLoad = Date.now();
    } catch (error) {
      logger.warn(`loadTemplateOverrides failed: ${error?.message}`);
    } finally {
      loading = null;
    }
  })();
  return loading;
}

const refreshIfStale = () => {
  if (Date.now() - lastLoad > REFRESH_MS) loadTemplateOverrides().catch(() => {});
};

/** Returns the customised HTML for `key` rendered with `vars`, or `fallbackHtml`. */
export function applyTemplateOverride(key, vars, fallbackHtml) {
  refreshIfStale();
  const row = cache.get(key);
  if (!row?.html) return fallbackHtml;
  return renderTemplateString(row.html, { year: new Date().getFullYear(), ...vars });
}

/** Customised subject for `key` (when the admin edited it), else `fallbackSubject`. */
export function applySubjectOverride(key, vars, fallbackSubject) {
  refreshIfStale();
  const row = cache.get(key);
  if (!row?.subject || row.subjectEditable === false) return fallbackSubject;
  return renderTemplateString(row.subject, vars);
}
