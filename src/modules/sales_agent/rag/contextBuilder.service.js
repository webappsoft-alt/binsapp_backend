const MAX_RAG_CONTEXT_CHARS = 6000; // ~1500 tokens
const MAX_HISTORY_CHARS = 4000;     // ~1000 tokens

export const BASE_SALES_SYSTEM_PROMPT = `
You are the BinsApp AI Sales Agent — an expert, friendly, and consultative sales engine for dumpster rentals, junk removal, tree services, and porta potty rentals.

### CORE OPERATIONAL DIRECTIVES:
1. CONSULTATIVE EXPERTISE: Recommend appropriate dumpster sizes (10yd for small garage cleanouts/single room, 20yd for roofing/remodels, 30yd for major additions, 40yd for large commercial/demolition).
2. NO PLACEHOLDERS / NO HALLUCINATIONS: Never invent fake prices, unverified discounts, or unconfirmed availability. Use verified system knowledge.
3. MULTI-FIELD RECOGNITION: When a visitor provides multiple details in one sentence (e.g. "I need a 20 yard dumpster in 33101 tomorrow for roofing"), acknowledge all provided fields immediately and ask ONLY for the missing details.
4. ACTION-ORIENTED CLOSING: When all required fields are collected, invoke the generate_prefilled_checkout tool or provide a clear call-to-action button so the user can complete their booking with zero double-entry.
5. PROVIDER ONBOARDING: Remind prospective haulers that it is 100% FREE to register, FREE to receive job alerts, and NO monthly subscription required.
6. COMMERCIAL / CONTRACTOR: For contractors or high-volume builders, highlight trade volume rates, dedicated account support, and route them to commercial specialist escalation.
7. SUPPORT / ACTIVE ORDERS: If a customer asks about an active order ("where is my dumpster", "need a swap", "driver status"), politely transfer to customer support rather than treating it as a new sales lead.
`.trim();

export const FUNNEL_DIRECTIVES = {
  dumpster_rental: "Goal: Recommend size, verify delivery address/zip, confirm delivery date, and provide quote & prefilled booking checkout link.",
  junk_removal: "Goal: Understand junk items, verify zip, prompt for project photos, and provide booking or custom quote.",
  tree_service: "Goal: Understand tree job type (removal, trimming, storm cleanup), zip, prompt for photos, and coordinate service dispatch.",
  porta_potty: "Goal: Confirm use case (jobsite, event), unit count, start date, duration, and provide instant booking.",
  provider_onboarding: "Goal: Highlight free registration, no monthly fees, and collect fleet capacity to prefill provider partner registration.",
  contractor_professional: "Goal: Offer contractor trade volume pricing, recurring schedules, and dedicated account manager support.",
  commercial_builder: "Goal: Assist with multi-location waste logistics, scheduled bin swaps, blanket pricing, and commercial escalation.",
  general_faq: "Goal: Answer questions using knowledge base facts; offer human specialist connection if uncertain.",
  support: "Goal: Assist with existing active orders, swap status, pickup scheduling, and driver updates.",
  unknown: "Goal: Identify the visitor's core need (residential, commercial, or provider partner) and guide into the right funnel.",
};

/**
 * Formats RAG knowledge chunks into a structured markdown reference block with token budgeting
 * @param {Array<Object>} chunks - Retrieved knowledge chunks
 * @returns {string} Formatted context string
 */
export function formatRAGContext(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "";
  }

  let formatted = "### VERIFIED KNOWLEDGE BASE CONTEXT (RAG):\nUse the verified reference facts below to answer the customer's questions accurately:\n\n";
  let currentLength = formatted.length;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkText = `[Reference ${i + 1}: ${chunk.topic}] (Category: ${chunk.category})\n${chunk.content}\n\n`;

    if (currentLength + chunkText.length > MAX_RAG_CONTEXT_CHARS) {
      break; // Enforce token budget
    }

    formatted += chunkText;
    currentLength += chunkText.length;
  }

  return formatted.trim();
}

/**
 * Formats and token-budgets the sliding window conversation history for OpenAI Chat Completions.
 * Ensures every tool-calling assistant turn is compliant with OpenAI API specifications:
 * - type: "function"
 * - id: string
 * - function: { name: string, arguments: string }
 * - followed immediately by matching role: "tool" messages responding to each tool_call_id
 *
 * @param {Array<Object>} history - Array of { role, content, toolCalls } messages
 * @returns {Array<Object>} Truncated array of messages formatted for OpenAI
 */
export function formatHistoryMessages(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  // Flatten and normalize turns into compliant OpenAI messages
  const expandedTurns = [];

  for (const m of history) {
    if (!m || !m.role) continue;

    const toolCallsList = m.toolCalls || m.tool_calls;
    if (m.role === "assistant" && Array.isArray(toolCallsList) && toolCallsList.length > 0) {
      // 1. Assistant message initiating tool calls
      const normalizedToolCalls = toolCallsList.map((tc, idx) => ({
        id: tc.id || `call_${Date.now()}_${idx}`,
        type: "function",
        function: {
          name: tc.function?.name || tc.name || "",
          arguments: typeof (tc.function?.arguments || tc.arguments) === "object"
            ? JSON.stringify(tc.function?.arguments || tc.arguments)
            : String(tc.function?.arguments || tc.arguments || "{}"),
        },
      }));

      // 2. Corresponding tool execution response messages
      const toolResponses = toolCallsList.map((tc, idx) => {
        const callId = tc.id || normalizedToolCalls[idx]?.id;
        let resultContent = "{\"success\":true}";
        if (tc.result !== undefined) {
          resultContent = typeof tc.result === "string" ? tc.result : JSON.stringify(tc.result);
        }
        return {
          role: "tool",
          tool_call_id: callId,
          content: resultContent,
        };
      });

      // 3. Optional subsequent verbal synthesis content from assistant
      const assistantDialogue = m.content
        ? [{ role: "assistant", content: m.content }]
        : [];

      // Pack as an atomic turn so sliding-window budgeting does not separate tool_calls from tool responses
      expandedTurns.push([
        {
          role: "assistant",
          content: null,
          tool_calls: normalizedToolCalls,
        },
        ...toolResponses,
        ...assistantDialogue,
      ]);
    } else if (m.role === "tool") {
      expandedTurns.push([
        {
          role: "tool",
          tool_call_id: m.tool_call_id || m.toolCallId || m.id || "call_unknown",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content || { success: true }),
        },
      ]);
    } else {
      // Standard role: user, assistant, system
      expandedTurns.push([
        {
          role: m.role,
          content: m.content || "",
        },
      ]);
    }
  }

  // Token / character sliding-window budgeting by turn
  let totalChars = 0;
  const budgeted = [];

  for (let i = expandedTurns.length - 1; i >= 0; i--) {
    const turnMessages = expandedTurns[i];
    const turnLen = turnMessages.reduce((sum, msg) => {
      let len = (msg.content || "").length;
      if (msg.tool_calls) {
        len += JSON.stringify(msg.tool_calls).length;
      }
      return sum + len;
    }, 0);

    if (totalChars + turnLen > MAX_HISTORY_CHARS && budgeted.length > 0) {
      break;
    }

    budgeted.unshift(...turnMessages);
    totalChars += turnLen;
  }

  // Safety sanitation: ensure history does not begin with an orphaned 'tool' message
  while (budgeted.length > 0 && budgeted[0].role === "tool") {
    budgeted.shift();
  }

  return budgeted;
}

/**
 * Assembles the complete prompt messages array augmented with RAG context,
 * funnel directives, structured collected data state, and sliding window conversation history.
 *
 * @param {Object} params
 * @param {string} [params.funnel='unknown'] - Current sales funnel
 * @param {Object} [params.funnelState=null] - Persistent structured funnel state
 * @param {Array<Object>} [params.ragChunks=[]] - Retrieved knowledge base chunks
 * @param {Array<Object>} [params.history=[]] - Sliding window dialogue history
 * @param {string} params.userQuery - Current user message
 * @param {Object} [params.visitorLocation] - Optional IP geo location metadata
 * @returns {Array<Object>} Array of messages ready for OpenAI chat completion
 */
export function buildAugmentedPrompt({
  funnel = "unknown",
  funnelState = null,
  liveSizes = null,
  ragChunks = [],
  history = [],
  userQuery,
  visitorLocation = null,
}) {
  const activeFunnel = funnelState?.currentFunnel || funnel;
  const funnelDirective = FUNNEL_DIRECTIVES[activeFunnel] || FUNNEL_DIRECTIVES.unknown;
  const ragContext = formatRAGContext(ragChunks);

  let systemPrompt = `${BASE_SALES_SYSTEM_PROMPT}\n\n### ACTIVE FUNNEL OBJECTIVE:\n${funnelDirective}`;

  if (funnelState) {
    systemPrompt += `\n\n### CURRENT FUNNEL & COLLECTED DATA STATE:
Active Funnel: ${funnelState.currentFunnel || activeFunnel}
Current Step: ${funnelState.currentStep || "intent_selection"}
Next Required Step: ${funnelState.nextStep || "service_selection"}
Already Collected Data: ${JSON.stringify(funnelState.collectedData || {})}
Missing Fields To Collect Next: ${(funnelState.missingFields && funnelState.missingFields.length > 0) ? funnelState.missingFields.join(", ") : "None (All required fields present, proceed to checkout or summary)"}

CRITICAL: Do NOT re-ask for fields that are already present in "Already Collected Data". Directly acknowledge what the customer has already shared and ask ONLY for the missing field.`;
  }

  if (visitorLocation && (visitorLocation.city || visitorLocation.state || visitorLocation.zip)) {
    systemPrompt += `\n\n### VISITOR LOCATION CONTEXT:\nDetected Location: ${[visitorLocation.city, visitorLocation.state, visitorLocation.zip].filter(Boolean).join(", ")}`;
  }

  if (Array.isArray(liveSizes) && liveSizes.length > 0) {
    systemPrompt += `\n\n### VERIFIED LIVE DUMPSTER SIZES & PRICING (DATABASE GROUND TRUTH):\n${liveSizes.map((s) => `- ${s.size}: $${s.startingPrice} starting base (${s.dimensions}, ${s.capacity}). Best for: ${s.bestFor}`).join("\n")}`;
  }

  if (ragContext) {
    systemPrompt += `\n\n${ragContext}`;
  }

  const messages = [{ role: "system", content: systemPrompt }];

  // Inject budgeted conversation history
  const historyMessages = formatHistoryMessages(history);
  if (historyMessages.length > 0) {
    messages.push(...historyMessages);
  }

  // Inject current user message
  messages.push({ role: "user", content: userQuery });

  return messages;
}

export default {
  buildAugmentedPrompt,
  formatRAGContext,
  formatHistoryMessages,
  BASE_SALES_SYSTEM_PROMPT,
  FUNNEL_DIRECTIVES,
};
