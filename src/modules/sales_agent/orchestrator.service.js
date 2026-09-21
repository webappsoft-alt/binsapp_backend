import { getOpenAIClient } from "../../utils/salesEmbedding.js";
import { logger } from "../../config/logger.js";
import {
  getCachedOrFetchEmbedding,
  retrieveRelevantKnowledge,
  getSessionHistory,
  getSessionMeta,
  appendMessage,
  buildAugmentedPrompt,
} from "./rag/index.js";
import {
  SALES_TOOLS_DEFINITIONS,
  executeToolCall,
} from "./tools/index.js";
import { handleSessionResumption } from "./scoring/index.js";
import {
  extractEntitiesFromMessage,
  updateSessionFunnelState,
  getSessionFunnelState,
  generateStepActionCard,
  getLiveDumpsterSizes,
} from "./funnel/index.js";

const MODEL_NAME = "gpt-4o-mini";

/**
 * Executes full multi-turn streaming AI sales conversation lifecycle
 * with multi-field extraction, persistent funnel state, and active action cards.
 *
 * @param {Object} params
 * @param {string} params.sessionId - Unique visitor session ID
 * @param {string} params.userMessage - Visitor message
 * @param {string} [params.funnel='unknown'] - Active sales funnel
 * @param {Object} [params.visitorLocation=null] - Geo location metadata
 * @param {Function} [params.onToken] - Callback for streaming text chunks: ({ token, chunkIndex }) => void
 * @param {Function} [params.onActionCard] - Callback for structured action cards: (card) => void
 * @returns {Promise<{ fullResponse: string, actionCards: Array<Object>, meta: Object }>}
 */
export async function orchestrateSalesConversation({
  sessionId,
  userMessage,
  funnel = "unknown",
  visitorLocation = null,
  onToken = () => {},
  onActionCard = () => {},
}) {
  const client = getOpenAIClient();
  const actionCards = [];

  // 1. Fetch current funnel state and extract multi-field entities from message
  const previousFunnelState = await getSessionFunnelState(sessionId);
  const newlyExtracted = extractEntitiesFromMessage(
    userMessage,
    previousFunnelState.collectedData || {}
  );

  // If visitor location was provided, merge zip into collectedData if not present
  if (visitorLocation?.zip && !newlyExtracted.zipCode) {
    newlyExtracted.zipCode = visitorLocation.zip;
  }

  const currentFunnelToUse = funnel !== "unknown" ? funnel : previousFunnelState.currentFunnel;

  // Persist updated funnel state to Redis
  const funnelState = await updateSessionFunnelState(sessionId, {
    currentFunnel: currentFunnelToUse,
    collectedData: newlyExtracted,
  });

  // 2. Retrieve query embedding vector (checking Redis cache first)
  let queryVector = [];
  try {
    queryVector = await getCachedOrFetchEmbedding(userMessage);
  } catch (embErr) {
    logger.warn(`Query vector generation failed for session ${sessionId}:`, embErr?.message || embErr);
  }

  // 3. Retrieve relevant knowledge base chunks (MongoDB Atlas $vectorSearch with fallback)
  let ragChunks = [];
  if (queryVector.length === 1536) {
    try {
      ragChunks = await retrieveRelevantKnowledge(queryVector, {
        limit: 4,
        targetAudience: "customer",
        minScore: 0.60,
      });
    } catch (ragErr) {
      logger.warn(`RAG retrieval failed for session ${sessionId}:`, ragErr?.message || ragErr);
    }
  }

  // 4. Retrieve sliding window conversation history from Redis
  const history = await getSessionHistory(sessionId, 10);

  // Check and recover session if visitor was previously marked as abandoned
  await handleSessionResumption(sessionId, userMessage, history);

  // Fetch live inventory specifications from database
  const liveSizes = await getLiveDumpsterSizes();

  // 5. Build augmented prompt messages with funnelState context and live inventory
  const messages = buildAugmentedPrompt({
    funnel: funnelState.currentFunnel,
    funnelState,
    liveSizes,
    ragChunks,
    history,
    userQuery: userMessage,
    visitorLocation,
  });

  // 6. Invoke OpenAI streaming chat completion with tools
  let streamResponse = await client.chat.completions.create({
    model: MODEL_NAME,
    messages,
    tools: SALES_TOOLS_DEFINITIONS,
    tool_choice: "auto",
    stream: true,
  });

  let fullAssistantText = "";
  let chunkIndex = 0;
  const toolCallsMap = {};

  for await (const chunk of streamResponse) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    // Stream text token if present
    if (delta.content) {
      fullAssistantText += delta.content;
      onToken({
        token: delta.content,
        chunkIndex: chunkIndex++,
        sessionId,
      });
    }

    // Accumulate tool call chunks if present
    if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = tc.index;
        if (!toolCallsMap[index]) {
          toolCallsMap[index] = {
            id: tc.id || `call_${Date.now()}_${index}`,
            type: "function",
            function: {
              name: tc.function?.name || "",
              arguments: "",
            },
            name: tc.function?.name || "",
            arguments: "",
          };
        }
        if (tc.function?.name) {
          toolCallsMap[index].function.name = tc.function.name;
          toolCallsMap[index].name = tc.function.name;
        }
        if (tc.function?.arguments) {
          toolCallsMap[index].function.arguments += tc.function.arguments;
          toolCallsMap[index].arguments += tc.function.arguments;
        }
      }
    }
  }

  const toolCalls = Object.values(toolCallsMap);

  // 7. Handle tool execution if any tool was invoked
  if (toolCalls.length > 0) {
    // Append the assistant's tool_calls intent to the message chain
    messages.push({
      role: "assistant",
      content: fullAssistantText || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function?.name || tc.name,
          arguments: tc.function?.arguments || tc.arguments,
        },
      })),
    });

    // Execute each tool handler
    for (const tc of toolCalls) {
      const toolName = tc.function?.name || tc.name;
      const toolArgs = tc.function?.arguments || tc.arguments;
      const executionResult = await executeToolCall(toolName, toolArgs, { sessionId });

      if (executionResult.actionCard) {
        const toolMeta = await getSessionFunnelState(sessionId);
        executionResult.actionCard.sessionId = sessionId;
        executionResult.actionCard.meta = toolMeta;
        actionCards.push(executionResult.actionCard);
        onActionCard(executionResult.actionCard);
      }

      tc.result = executionResult.result;

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(executionResult.result),
      });
    }

    // Second turn: Stream the final conversational synthesis to the visitor
    const secondTurnStream = await client.chat.completions.create({
      model: MODEL_NAME,
      messages,
      stream: true,
    });

    for await (const chunk of secondTurnStream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullAssistantText += delta.content;
        onToken({
          token: delta.content,
          chunkIndex: chunkIndex++,
          sessionId,
        });
      }
    }
  }

  // 8. If no tool card was produced, check if the current step warrants a contextual action card
  const refreshedFunnelState = await getSessionFunnelState(sessionId);
  if (actionCards.length === 0) {
    const contextualCard = generateStepActionCard(
      refreshedFunnelState.currentFunnel,
      refreshedFunnelState.currentStep,
      refreshedFunnelState.collectedData,
      sessionId,
      liveSizes
    );
    if (contextualCard) {
      actionCards.push(contextualCard);
      onActionCard({
        ...contextualCard,
        meta: refreshedFunnelState,
      });
    }
  } else {
    // Ensure all tool action cards carry the latest meta
    actionCards.forEach((c) => {
      c.meta = refreshedFunnelState;
    });
  }

  // 9. Store dialogue turn in Redis sliding window buffer (2h TTL) and async flush to MongoDB
  await appendMessage(
    sessionId,
    { role: "user", content: userMessage },
    {
      currentFunnel: refreshedFunnelState.currentFunnel,
      visitorInfo: visitorLocation,
    }
  );

  const serializedToolCalls = toolCalls.map((tc) => ({
    id: tc.id,
    type: "function",
    function: {
      name: tc.function?.name || tc.name,
      arguments: tc.function?.arguments || tc.arguments,
    },
    name: tc.function?.name || tc.name,
    arguments: tc.function?.arguments || tc.arguments,
    result: tc.result,
  }));

  await appendMessage(
    sessionId,
    {
      role: "assistant",
      content: fullAssistantText,
      toolCalls: serializedToolCalls,
      actionCards: actionCards.length > 0 ? actionCards : [],
    },
    {
      currentFunnel: refreshedFunnelState.currentFunnel,
      actionCards,
    }
  );

  return {
    fullResponse: fullAssistantText,
    actionCards,
    meta: refreshedFunnelState,
  };
}

export default {
  orchestrateSalesConversation,
};
