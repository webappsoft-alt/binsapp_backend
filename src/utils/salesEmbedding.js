import OpenAI from "openai";
import env from "../config/env.js";
import { logger } from "../config/logger.js";
import { BadRequestError, ConfigurationError, ApiError } from "./apiError.js";

let openaiClient = null;

/**
 * Returns a lazy-singleton instance of the OpenAI client
 */
export function getOpenAIClient() {
  if (openaiClient) return openaiClient;

  const apiKey =
    (typeof env.get === "function" ? env.get("OpenAIApiKey") : null) ||
    process.env.OPENAI_API_KEY ||
    process.env.AI_ASSESSMENT_API_KEY;

  if (!apiKey) {
    throw new ConfigurationError(
      "OpenAI API Key is not configured in the environment (OpenAIApiKey / OPENAI_API_KEY / AI_ASSESSMENT_API_KEY)."
    );
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/**
 * Normalizes input text for vector embedding generation
 * @param {string} text - Raw input text
 * @returns {string} Cleaned single-line or normalized text
 */
export function normalizeEmbeddingInput(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\0/g, "")           // Strip null bytes
    .replace(/\r\n|\r/g, "\n")    // Standardize line breaks
    .replace(/\n{2,}/g, "\n")     // Collapse excessive newlines
    .replace(/[ \t]+/g, " ")      // Collapse multi-spaces/tabs
    .trim();
}

/**
 * Generates a 1536-dimensional float vector embedding for given text
 * using OpenAI's `text-embedding-3-small` model.
 *
 * @param {string} text - Input text content to embed
 * @returns {Promise<number[]>} 1536 float array
 */
export async function generateEmbedding(text) {
  const normalizedText = normalizeEmbeddingInput(text);

  if (!normalizedText || normalizedText.length < 3) {
    throw new BadRequestError(
      "Valid text content (min 3 characters) is required to generate vector embedding."
    );
  }

  const client = getOpenAIClient();

  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: normalizedText,
      encoding_format: "float",
    });

    const embedding = response?.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new ApiError(
        "EMBEDDING_GENERATION_FAILED",
        502,
        "Failed to receive valid vector embedding from OpenAI."
      );
    }

    return embedding;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    logger.error("OpenAI Embedding generation error:", error);

    const errorMessage =
      error?.message || "Failed to generate vector embedding from OpenAI.";
    const statusCode = error?.status || error?.statusCode || 500;

    throw new ApiError(
      "OPENAI_EMBEDDING_ERROR",
      statusCode >= 400 && statusCode < 600 ? statusCode : 500,
      errorMessage,
      null,
      [],
      { originalError: error?.name || "OpenAIError" }
    );
  }
}
