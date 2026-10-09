import { getOpenAIClient } from "../../utils/salesEmbedding.js";
import { logger } from "../../config/logger.js";
import { normalizeSalesServiceType } from "../../models/SalesLead.js";
import { processJunkAnalysisInBackground } from "../../utils/JunkRemovalVisionProcessor.js";
import { processTreeAnalysisInBackground } from "../../utils/OpenAIVisionBackgroundProcessor.js";
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
  getUnfinishedBookingSummary,
  isQuestionOrInquiry,
} from "./funnel/index.js";
import User from "../../models/User.js";
import { getUserRegisteredServices } from "./utils/userRegistration.util.js";

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
  userId = null,
  visitorId = null,
  userMessage,
  funnel = "unknown",
  visitorLocation = null,
  explicitLocation = null,
  onToken = () => {},
  onActionCard = () => {},
}) {
  const client = getOpenAIClient();
  const actionCards = [];

  // Fetch user registration info if authenticated
  let registeredServices = {};
  if (userId) {
    try {
      const userDoc = await User.findById(userId)
        .populate(["junkRemoval", "treeRemoval", "company"])
        .select("-password")
        .lean();
      if (userDoc) {
        registeredServices = getUserRegisteredServices(userDoc);
      }
    } catch (uErr) {
      logger.warn(`[SalesAgent] Failed to fetch user ${userId} for registration check:`, uErr?.message);
    }
  }

  // 1. Fetch current funnel state and extract multi-field entities from message
  const previousFunnelState = await getSessionFunnelState(sessionId);
  const newlyExtracted = extractEntitiesFromMessage(
    userMessage,
    previousFunnelState.collectedData || {}
  );
  if (newlyExtracted.registeredServices) {
    delete newlyExtracted.registeredServices;
  }

  // If user explicitly sent location (from LocationPickerCard, LeadFormCard, or options.location):
  if (explicitLocation) {
    if (explicitLocation.address || explicitLocation.deliveryAddress) {
      newlyExtracted.address = explicitLocation.address || explicitLocation.deliveryAddress;
      newlyExtracted.deliveryAddress = explicitLocation.deliveryAddress || explicitLocation.address;
    }
    if (explicitLocation.zipCode || explicitLocation.zip) {
      newlyExtracted.zipCode = explicitLocation.zipCode || explicitLocation.zip;
      newlyExtracted.baseZip = newlyExtracted.zipCode;
    }
    if (explicitLocation.city) newlyExtracted.city = explicitLocation.city;
    if (explicitLocation.state) newlyExtracted.state = explicitLocation.state;
    if (explicitLocation.lat != null && Number.isFinite(Number(explicitLocation.lat))) {
      newlyExtracted.lat = Number(explicitLocation.lat);
    }
    if (explicitLocation.lng != null && Number.isFinite(Number(explicitLocation.lng))) {
      newlyExtracted.lng = Number(explicitLocation.lng);
    }
  }

  // If newlyExtracted has zipCode or address, fill remaining coordinates/city/state from visitorLocation if present
  if ((newlyExtracted.zipCode || newlyExtracted.address) && visitorLocation) {
    if (!newlyExtracted.city && visitorLocation.city) newlyExtracted.city = visitorLocation.city;
    if (!newlyExtracted.state && visitorLocation.state) newlyExtracted.state = visitorLocation.state;
    if (newlyExtracted.lat == null && visitorLocation.lat != null && Number.isFinite(Number(visitorLocation.lat))) {
      newlyExtracted.lat = Number(visitorLocation.lat);
    }
    if (newlyExtracted.lng == null && visitorLocation.lng != null && Number.isFinite(Number(visitorLocation.lng))) {
      newlyExtracted.lng = Number(visitorLocation.lng);
    }
    if (!newlyExtracted.address && visitorLocation.address) {
      newlyExtracted.address = visitorLocation.address;
      newlyExtracted.deliveryAddress = visitorLocation.address;
    }
  }

  // Store detected visitor ZIP as suggestion, but DO NOT auto-fill zipCode unless explicitly given
  if (visitorLocation?.zip && !newlyExtracted.detectedZip) {
    newlyExtracted.detectedZip = visitorLocation.zip;
  }

  let currentFunnelToUse = funnel !== "unknown" ? funnel : previousFunnelState.currentFunnel;
  if (newlyExtracted.resetService || (newlyExtracted.primaryIntent === "I NEED A SERVICE" && !newlyExtracted.serviceType)) {
    currentFunnelToUse = "service_booking";
  } else if (newlyExtracted.primaryIntent === "I WANT TO JOIN AS A PROVIDER") {
    currentFunnelToUse = "provider_onboarding";
  } else if (newlyExtracted.primaryIntent === "I’M A BUILDER / COMMERCIAL CUSTOMER") {
    currentFunnelToUse = "commercial_builder";
  } else if (newlyExtracted.serviceType) {
    const norm = normalizeSalesServiceType(newlyExtracted.serviceType);
    if (norm === "Junk Removal") currentFunnelToUse = "junk_removal";
    else if (norm === "Tree Removal") currentFunnelToUse = "tree_service";
    else if (norm === "Porta Potty") currentFunnelToUse = "porta_potty";
    else if (norm === "Dumbster") currentFunnelToUse = "dumpster_rental";
  }

  // Instant AI Vision Analysis for Junk Removal & Tree Service when photos are uploaded
  const photosList = Array.isArray(newlyExtracted.photos) ? newlyExtracted.photos : [];
  if (photosList.length >= 2) {
    const region = newlyExtracted.zipCode || visitorLocation?.zip || visitorLocation?.city || "global";

    if (currentFunnelToUse === "junk_removal" && !newlyExtracted.junkAnalysis) {
      try {
        logger.info(`[SalesAgent] Executing AI Vision analysis on ${photosList.length} Junk Removal images for session ${sessionId}...`);
        const analysis = await processJunkAnalysisInBackground(photosList.slice(0, 5), region);
        if (analysis?.ai_detection) {
          newlyExtracted.junkAnalysis = analysis;
          const quote = analysis.pricing_result?.quote || analysis.pricing_result?.final_quote;
          if (quote) {
            newlyExtracted.estimatedPrice = quote;
          }
          if (analysis.pricing_result?.manual_review_required != null) {
            newlyExtracted.manualReviewRequired = Boolean(analysis.pricing_result.manual_review_required);
            newlyExtracted.manualReviewReasons = analysis.pricing_result.manual_review_reasons || [];
          }
          if (analysis.ai_detection.estimated_cubic_yards) {
            newlyExtracted.aiEstimatedCubicYards = analysis.ai_detection.estimated_cubic_yards;
          }
          logger.info(`[SalesAgent] Junk Vision complete: ${analysis.ai_detection.estimated_cubic_yards} cy, Quote $${newlyExtracted.estimatedPrice}, ManualReview: ${newlyExtracted.manualReviewRequired}`);
        }
      } catch (junkErr) {
        logger.error(`[SalesAgent] Junk removal vision processing failed for session ${sessionId}:`, junkErr?.message || junkErr);
      }
    } else if (currentFunnelToUse === "tree_service" && !newlyExtracted.treeAnalysis) {
      try {
        logger.info(`[SalesAgent] Executing AI Vision analysis on ${photosList.length} Tree Service images for session ${sessionId}...`);
        const analysis = await processTreeAnalysisInBackground(photosList.slice(0, 5), region);
        if (analysis?.ai_detection) {
          newlyExtracted.treeAnalysis = analysis;
          const quote = analysis.pricing_result?.quote || analysis.pricing_result?.final_quote;
          if (quote) {
            newlyExtracted.estimatedPrice = quote;
          }
          if (analysis.pricing_result?.manual_review_required != null) {
            newlyExtracted.manualReviewRequired = Boolean(analysis.pricing_result.manual_review_required);
            newlyExtracted.manualReviewReasons = analysis.pricing_result.manual_review_reasons || [];
          }
          if (analysis.ai_detection.estimated_height_ft) {
            newlyExtracted.aiEstimatedHeightFt = analysis.ai_detection.estimated_height_ft;
            newlyExtracted.aiEstimatedDbhIn = analysis.ai_detection.estimated_dbh_in;
            newlyExtracted.aiTreeType = analysis.ai_detection.tree_type;
          }
          logger.info(`[SalesAgent] Tree Vision complete: ${analysis.ai_detection.estimated_height_ft} ft, Quote $${newlyExtracted.estimatedPrice}, ManualReview: ${newlyExtracted.manualReviewRequired}`);
        }
      } catch (treeErr) {
        logger.error(`[SalesAgent] Tree service vision processing failed for session ${sessionId}:`, treeErr?.message || treeErr);
      }
    }
  }

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

  // Fetch live dumpster inventory specifications ONLY if in dumpster rental funnel
  const liveSizes = funnelState.currentFunnel === "dumpster_rental"
    ? await getLiveDumpsterSizes()
    : null;

  // 5. Build augmented prompt messages with funnelState context and live inventory
  const messages = buildAugmentedPrompt({
    funnel: funnelState.currentFunnel,
    funnelState,
    liveSizes,
    ragChunks,
    history,
    userQuery: userMessage,
    visitorLocation,
    registeredServices,
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
      const executionResult = await executeToolCall(toolName, toolArgs, {
        sessionId,
        activeFunnel: funnelState.currentFunnel,
        visitorLocation: explicitLocation || visitorLocation,
      });

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
  refreshedFunnelState.unfinishedBooking = getUnfinishedBookingSummary(refreshedFunnelState);

  const stepChanged = previousFunnelState.currentStep !== refreshedFunnelState.currentStep;
  const isExplicitResumeOrStart =
    /\b(resume|continue|start over|restart|show form|open form)\b/i.test(userMessage.trim()) ||
    userMessage.trim().toLowerCase() === "resume" ||
    userMessage.trim().toLowerCase() === "continue" ||
    userMessage.trim().toLowerCase() === "resume my booking";

  const userAskedQuestion = isQuestionOrInquiry(userMessage);

  // Do NOT attach contextual cards if user asked a question or if step did not change (unless explicit resume)
  const shouldEmitStepCard =
    actionCards.length === 0 &&
    !userAskedQuestion &&
    (stepChanged || isExplicitResumeOrStart);

  if (shouldEmitStepCard) {
    const contextualCard = generateStepActionCard(
      refreshedFunnelState.currentFunnel,
      refreshedFunnelState.currentStep,
      refreshedFunnelState.collectedData,
      sessionId,
      liveSizes,
      registeredServices
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
    {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    },
    {
      currentFunnel: refreshedFunnelState.currentFunnel,
      visitorInfo: visitorLocation,
      visitorId,
      userId,
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
      timestamp: new Date().toISOString(),
    },
    {
      currentFunnel: refreshedFunnelState.currentFunnel,
      actionCards,
      visitorId,
      userId,
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
