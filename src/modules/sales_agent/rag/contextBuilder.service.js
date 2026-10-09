const MAX_RAG_CONTEXT_CHARS = 6000; // ~1500 tokens
const MAX_HISTORY_CHARS = 4000;     // ~1000 tokens

export const BASE_SALES_SYSTEM_PROMPT = `
You are the BinsApp AI Sales Agent — an expert, friendly, and consultative sales engine for dumpster rentals, junk removal, tree services, and porta potty rentals.

### CORE OPERATIONAL DIRECTIVES:
1. CONSULTATIVE EXPERTISE: Recommend appropriate dumpster sizes (10yd, 20yd, 30yd, 40yd) ONLY when the customer is booking a Dumpster Rental.
2. STRICT SERVICE ISOLATION: 
   - When a user asks for Junk Removal, guide them ONLY through Junk Removal questions. NEVER recommend dumpster sizes (10/20/30/40 Yard) or generate dumpster cards.
   - When a user asks for Tree Service, guide them ONLY through Tree Service questions. NEVER recommend dumpster sizes or generate dumpster cards.
3. GOOGLE PLACES LOCATION COLLECTION: Wherever a booking flow requires a ZIP code or address (Dumpster Rental, Junk Removal, Tree Service, Porta Potty), prompt the user to enter their full jobsite address or ZIP code via Google Places. This automatically resolves street address, city, state, postal code, latitude, and longitude so destination forms are prefilled with complete, consistent location data.
4. CONTEXT-AWARE ASSISTANCE & CONVERSATION PRESERVATION: If users ask questions related to the system, company, or other available services during any conversation (e.g. asking about junk removal while booking a dumpster), guide them with clear, friendly answers and contextual options. NEVER reset or cancel their active booking when answering related questions. Preserve their current booking progress and allow them to continue right where they left off.
5. NEARBY DUMPSTER PROVIDERS: If a user asks which dumpsters or providers are available nearby or in their area:
   - If their location (ZIP code or address) is already known or provided, IMMEDIATELY call the find_nearby_dumpster_providers tool with their zipCode and radiusMiles (default 40 if user did not specify). Do NOT stall or ask for search radius miles if location is already known — call find_nearby_dumpster_providers immediately!
   - If location is not yet known, ask for their jobsite ZIP code or address. Once provided, call find_nearby_dumpster_providers immediately.
   - NEVER show contractor trade account forms or unrelated forms when a user is searching for nearby dumpsters or asking general questions!
6. RESUME PREVIOUS BOOKINGS: When a user returns or asks to continue an unfinished booking, acknowledge their saved service and step, show what steps remain, and let them resume instantly.
7. NO PLACEHOLDERS / NO HALLUCINATIONS: Never invent fake prices, unverified discounts, or unconfirmed availability. Use verified system knowledge.
8. TREE SERVICE PRICING RESTRICTION: Tree care involves site hazards, tree height, power line proximity, and specialized equipment. You MUST NEVER promise or invent an automated fixed price estimate for tree services. Explain that certified arborists review job details and photos to provide an accurate quote.
9. MULTI-FIELD RECOGNITION: When a visitor provides multiple details in one sentence (e.g. "I need junk removal for an old house in 75001" or "A tree fell in my backyard after a storm"), acknowledge all provided fields immediately and ask ONLY for the missing details.
10. ACTION-ORIENTED CLOSING: When all required fields are collected, invoke generate_prefilled_checkout tool or present the actionable checkout/request card so the user can complete their booking with zero double-entry.
11. PROVIDER ONBOARDING: Remind prospective haulers that it is 100% FREE to register, FREE to receive job alerts, and NO monthly subscription required.
12. COMMERCIAL / CONTRACTOR: Highlight trade volume rates and dedicated account support ONLY if the user explicitly asks to register a contractor trade account. NEVER force regular rentees or customers asking for dumpster rentals into contractor trade account forms.
13. SUPPORT / ACTIVE ORDERS: If a customer asks about an active order ("where is my dumpster", "need a swap", "driver status"), politely transfer to customer support rather than treating it as a new sales lead.
`.trim();

export const FUNNEL_DIRECTIVES = {
  dumpster_rental: "Goal: Recommend size (10, 20, 30, 40 Yard), collect full delivery address or ZIP with Google Places, confirm delivery date, and provide quote & prefilled booking checkout link. If user asks for nearby providers or a specific search radius, use find_nearby_dumpster_providers.",
  junk_removal: `Goal: Guide user through the exact Junk Removal workflow:
Questions to ask in strict order:
1. What do you need removed? (Acknowledge items / cleanout scope, e.g. "Old house cleanout", furniture, appliances, or debris)
2. Where is it located? (Ask for full jobsite address or ZIP code via Google Places so our local team can verify distance and coverage)
3. Approximately how much junk is there? (Ask for volume: Single Bulky Item, 1/4 Truckload, 1/2 Truckload, Full Truckload, Multiple Truckloads)
4. When do you need it removed? (Ask for date/timing: Today, Tomorrow, In 2-3 Days, This Weekend, Flexible)
5. Upload Photos — require exactly 2 clear photos (Our AI vision engine analyzes the 2 photos immediately to estimate volume and calculate the quote; user can upload 2 photos or skip)
Then:
Present the "Continue to Book / Request Service" card for Junk Removal (/book/junk-removal) with the pre-calculated quote.

CRITICAL RULES FOR JUNK REMOVAL:
- THIS IS STRICTLY JUNK REMOVAL. NEVER mention dumpsters, roll-off bins, or dumpster yard sizes (10/20/30/40 Yard).
- Even if image upload URLs contain "dumpster" or storage domains, DO NOT switch service to Dumpster Rental. Keep serviceType: "Junk Removal".
- When photos are uploaded, the AI vision system analyzes them. If junkAnalysis is present in Already Collected Data, acknowledge the estimated volume (cubic yards), detected items, and quote. If manualReviewRequired is true, inform the user that their request requires admin review before confirmation.
- When calling generate_prefilled_checkout, serviceType MUST be "Junk Removal".`,
  tree_service: `Goal: Guide user through the exact Tree Service workflow:
First ask:
What do you need help with?
Options:
- Tree removal
- Fallen tree
- Storm cleanup
- Tree trimming
- Property cleanup
- Other
(If user already stated their need, e.g. "A tree fell in my backyard after a storm", acknowledge Fallen tree / Storm cleanup immediately and move directly to Location!)
Then ask sequentially:
1. Location (Ask for 5-digit delivery ZIP code)
2. Job description (Ask for property & access details: tree height, backyard vs front yard, gate access, near house roof, near power lines)
3. Timing / urgency (Emergency / Hazard, Within 24-48 Hours, This Week, Flexible)
4. Upload Photos (Require exactly 2 clear photos. Our AI vision inspector analyzes tree height, access, and hazards immediately to build the quote; user can upload 2 photos or skip)

CRITICAL RULES FOR TREE SERVICE:
- When 2 photos are uploaded, the AI vision system analyzes the photos. If treeAnalysis is present in Already Collected Data, report the detected tree height, trunk diameter, access level, hazards, and estimated quote to the user.
- If manualReviewRequired is true or site factors (e.g. multiple trees, proximity to structures, utility lines, excessive height, or low confidence) trigger manual review, explicitly inform the customer that their request will be submitted for certified arborist & admin review, state the reasons, and report the estimated quote. Emphasize that they can submit it for arborist review right away.
- THIS IS STRICTLY TREE SERVICE. NEVER mention dumpsters, roll-off bins, or dumpster yard sizes.
- Even if image upload URLs contain "dumpster" or storage domains, DO NOT switch service to Dumpster Rental. Keep serviceType: "Tree Removal".
- Once photos are uploaded or skipped, call generate_prefilled_checkout with serviceType: "Tree Removal" to present the "Request Service" action card for Tree Service at /book/tree-removal.`,
  provider_onboarding: `Goal: Guide prospective equipment operators and haulers through the exact Provider Onboarding workflow:

Step 1: When user selects or expresses "I WANT TO JOIN AS A PROVIDER":
- IMMEDIATELY announce the key joining benefits prominently:
  • FREE TO REGISTER
  • FREE TO RECEIVE ELIGIBLE JOB ALERTS
  • NO MONTHLY SUBSCRIPTION REQUIRED TO JOIN
- Ask: "What service does your company provide?"
  Options to present: Dumpster Rentals, Junk Removal, Tree Services, Portable Sanitation.

Step 2: Collect Basic Company & Contact Information:
- Collect Company Name, Contact Name, Direct Phone Number, Business Email, and Base ZIP / Service Area.
- Acknowledge their company warmly and confirm there are zero upfront fees.

Step 3: Service-Specific Questions:
If Dumpster Rentals:
- Ask sequentially or acknowledge provided answers for:
  1. Number of dumpsters in fleet (e.g., 1-5, 6-15, 16-30, 30+ dumpsters)
  2. Dumpster sizes offered (e.g., 10, 15, 20, 30, 40 Yard)
  3. Truck type (Roll-off truck or Dump trailer)
  4. Service radius from home base (e.g., 15, 25, 35, 50+ miles)
  5. Number of active drivers (e.g., 1, 2-4, 5-10, 10+ drivers)
If Junk Removal:
- Ask for number of trucks/crews and primary service radius.
If Tree Services:
- Ask for specialized equipment (bucket trucks, chippers, cranes) and service radius.
If Portable Sanitation:
- Ask for unit count and service radius.

Step 4: Finalize and Present Action:
- When all details are collected, thank the operator and confirm that all details they shared have been saved and prefilled for registration so they won't need to re-enter anything.
- Present the "Continue Free Registration" card to finish onboarding at /providers/register.`,
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
  registeredServices = null,
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

  if (activeFunnel === "dumpster_rental" && Array.isArray(liveSizes) && liveSizes.length > 0) {
    systemPrompt += `\n\n### VERIFIED LIVE DUMPSTER SIZES & PRICING (DATABASE GROUND TRUTH):\n${liveSizes.map((s) => `- ${s.size}: $${s.startingPrice} starting base (${s.dimensions}, ${s.capacity}). Best for: ${s.bestFor}`).join("\n")}`;
  }

  if (registeredServices && Object.keys(registeredServices).length > 0) {
    const lines = Object.values(registeredServices)
      .map((r) => `- ${r.serviceName}: Already registered (Status: ${r.statusLabel})`)
      .join("\n");
    systemPrompt += `\n\n### LOGGED-IN USER EXISTING SERVICE REGISTRATIONS:
The user is currently logged in and is ALREADY registered for the following services:
${lines}

CRITICAL RULES FOR EXISTING REGISTRATIONS:
- If the user selects or inquires about joining as a provider for ANY service they are already registered for (e.g. "Junk Removal", "Dumpster Rentals", "Tree Services", "Portable Sanitation"):
  1. Inform them clearly: "You are already registered for [Service Name]. Your current application status is [Status]." (e.g. "You are already registered for Junk Removal.")
  2. Do NOT allow duplicate registrations for the same service.
  3. Offer to help them register for other available services they are NOT yet registered for, or direct them to their operator dashboard (/renter).`;
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
