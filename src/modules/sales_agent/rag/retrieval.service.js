import SalesKnowledgeBase from "../../../models/SalesKnowledgeBase.js";
import { logger } from "../../../config/logger.js";

const DEFAULT_VECTOR_INDEX = "sales_knowledge_vector_index";
const DEFAULT_LIMIT = 4;
const DEFAULT_MIN_SCORE = 0.60;

/**
 * Computes cosine similarity between two float vectors
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Similarity score between -1 and 1
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Executes MongoDB Atlas $vectorSearch pipeline on SalesKnowledgeBase collection
 */
async function retrieveViaAtlasVectorSearch(queryVector, options) {
  const limit = Math.min(10, Math.max(1, Number(options.limit) || DEFAULT_LIMIT));
  const minScore = typeof options.minScore === "number" ? options.minScore : DEFAULT_MIN_SCORE;
  const indexName = process.env.MONGODB_VECTOR_INDEX || DEFAULT_VECTOR_INDEX;

  const filterConditions = [
    { "metadata.active": { $eq: true } },
    { isDeleted: { $eq: false } },
  ];

  if (options.category) {
    filterConditions.push({ category: { $eq: options.category } });
  }

  if (options.targetAudience && options.targetAudience !== "all") {
    filterConditions.push({
      "metadata.targetAudience": { $in: [options.targetAudience, "all"] },
    });
  }

  const pipeline = [
    {
      $vectorSearch: {
        index: indexName,
        path: "embedding",
        queryVector: queryVector,
        numCandidates: Math.max(50, limit * 10),
        limit: limit * 2,
        filter: {
          $and: filterConditions,
        },
      },
    },
    {
      $project: {
        topic: 1,
        category: 1,
        content: 1,
        metadata: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
    {
      $match: {
        score: { $gte: minScore },
      },
    },
    {
      $limit: limit,
    },
  ];

  return await SalesKnowledgeBase.aggregate(pipeline);
}

/**
 * Resilient fallback retrieval using in-memory Cosine Similarity
 * (Used when MongoDB Atlas Search index is uninitialized, rebuilding, or running locally)
 */
async function retrieveViaCosineFallback(queryVector, options) {
  const limit = Math.min(10, Math.max(1, Number(options.limit) || DEFAULT_LIMIT));
  const minScore = typeof options.minScore === "number" ? options.minScore : DEFAULT_MIN_SCORE;

  const query = {
    isDeleted: false,
    "metadata.active": true,
  };

  if (options.category) {
    query.category = options.category;
  }

  if (options.targetAudience && options.targetAudience !== "all") {
    query["metadata.targetAudience"] = { $in: [options.targetAudience, "all"] };
  }

  // Fetch active candidate docs including raw embedding
  const candidates = await SalesKnowledgeBase.find(query)
    .select("+embedding")
    .limit(100)
    .lean();

  if (!candidates || candidates.length === 0) {
    return [];
  }

  const scored = [];
  for (const doc of candidates) {
    if (Array.isArray(doc.embedding) && doc.embedding.length === queryVector.length) {
      const score = cosineSimilarity(queryVector, doc.embedding);
      if (score >= minScore) {
        const item = { ...doc, score };
        delete item.embedding;
        scored.push(item);
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Main RAG Retrieval Entry Point: Retrieves top relevant knowledge base chunks
 * using MongoDB $vectorSearch with transparent in-memory cosine fallback.
 *
 * @param {number[]} queryVector - 1536 float query vector
 * @param {Object} options - Filtering & pagination options
 * @param {number} [options.limit=4] - Max chunks to retrieve
 * @param {string} [options.category] - Filter by specific category
 * @param {string} [options.targetAudience='all'] - Target audience filter
 * @param {number} [options.minScore=0.60] - Minimum score threshold
 * @returns {Promise<Array<Object>>} Top matched knowledge chunks with similarity score
 */
export async function retrieveRelevantKnowledge(queryVector, options = {}) {
  if (!Array.isArray(queryVector) || queryVector.length === 0) {
    return [];
  }

  try {
    const results = await retrieveViaAtlasVectorSearch(queryVector, options);
    if (results && results.length > 0) {
      return results;
    }
    // If Atlas vector search returned 0 results, check fallback before returning empty
    return await retrieveViaCosineFallback(queryVector, options);
  } catch (error) {
    logger.warn(
      "Atlas $vectorSearch aggregation unavailable or failed, utilizing Cosine Similarity fallback:",
      error?.message || error
    );
    return await retrieveViaCosineFallback(queryVector, options);
  }
}

export default {
  retrieveRelevantKnowledge,
  cosineSimilarity,
};
