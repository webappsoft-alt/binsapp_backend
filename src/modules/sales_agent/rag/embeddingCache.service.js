import crypto from "node:crypto";
import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";
import { generateEmbedding, normalizeEmbeddingInput } from "../../../utils/salesEmbedding.js";

const EMBEDDING_CACHE_TTL_SECONDS = 86400; // 24 Hours
const KEY_PREFIX = "sales:cache:embedding:";

/**
 * Normalizes query string specifically for semantic cache key generation
 * (lowercase, strips non-alphanumeric punctuation, collapses spaces)
 * @param {string} text - Raw query text
 * @returns {string} Normalized text string
 */
export function normalizeQueryForCache(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Replace punctuation with space
    .replace(/\s+/g, " ")      // Collapse spaces
    .trim();
}

/**
 * Computes a SHA-256 hash of the normalized query text
 * @param {string} text - Input text
 * @returns {string} Hex hash
 */
export function hashQuery(text) {
  const normalized = normalizeQueryForCache(text);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Retrieves a vector embedding for the input query, checking Redis cache first.
 * If cache misses, calls OpenAI embedding model, caches the vector for 24h, and returns it.
 *
 * @param {string} queryText - User's search query or question
 * @returns {Promise<number[]>} 1536 float array embedding
 */
export async function getCachedOrFetchEmbedding(queryText) {
  const hash = hashQuery(queryText);
  const cacheKey = `${KEY_PREFIX}${hash}`;

  // 1. Try Redis cache lookup
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const vector = JSON.parse(cached);
      if (Array.isArray(vector) && vector.length === 1536) {
        return vector;
      }
    }
  } catch (redisError) {
    logger.warn(`Redis query vector cache lookup failed for key ${cacheKey}:`, redisError?.message || redisError);
    // Continue to fallback generation without crashing
  }

  // 2. Cache miss: generate embedding via OpenAI text-embedding-3-small
  const embedding = await generateEmbedding(queryText);

  // 3. Store in Redis asynchronously (fire-and-forget safe)
  try {
    await redis.set(cacheKey, JSON.stringify(embedding), "EX", EMBEDDING_CACHE_TTL_SECONDS);
  } catch (redisSetError) {
    logger.warn(`Redis query vector caching failed for key ${cacheKey}:`, redisSetError?.message || redisSetError);
  }

  return embedding;
}

export default {
  getCachedOrFetchEmbedding,
  normalizeQueryForCache,
  hashQuery,
};
