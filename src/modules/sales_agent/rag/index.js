export {
  getCachedOrFetchEmbedding,
  normalizeQueryForCache,
  hashQuery,
} from "./embeddingCache.service.js";

export {
  retrieveRelevantKnowledge,
  cosineSimilarity,
} from "./retrieval.service.js";

export {
  appendMessage,
  getSessionHistory,
  getSessionMeta,
  getSessionMessagesKey,
  getSessionMetaKey,
} from "./sessionBuffer.service.js";

export {
  buildAugmentedPrompt,
  formatRAGContext,
  formatHistoryMessages,
  BASE_SALES_SYSTEM_PROMPT,
  FUNNEL_DIRECTIVES,
} from "./contextBuilder.service.js";
