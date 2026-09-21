import { Server } from "socket.io";
import { orchestrateSalesConversation } from "../orchestrator.service.js";
import {
  getSessionHistory,
  getSessionMeta,
  appendMessage,
} from "../rag/index.js";
import {
  isSessionPaused,
  getSessionHandoffState,
  claimSessionByOperator,
  releaseSessionToAI,
  recordVisitorHandoffRequest,
} from "./handoff.service.js";
import { generateStepActionCard, getLiveDumpsterSizes } from "../funnel/index.js";
import { logger } from "../../../config/logger.js";

/**
 * Initializes the dedicated `/sales-agent` Socket.io gateway namespace
 *
 * @param {Server} io - Master Socket.io instance
 * @returns {Namespace}
 */
export function initSalesAgentSocket(io) {
  if (!io) {
    logger.warn("Socket.io master instance not provided to initSalesAgentSocket.");
    return null;
  }

  const salesNamespace = io.of("/sales-agent");

  // Connection authentication and session validation middleware
  salesNamespace.use(async (socket, next) => {
    try {
      const sessionId =
        socket.handshake.auth?.sessionId ||
        socket.handshake.query?.sessionId;

      if (!sessionId || typeof sessionId !== "string") {
        return next(new Error("Authentication failed: 'sessionId' is required."));
      }

      socket.sessionId = sessionId.trim();

      // Extract visitor location context if passed in handshake
      if (socket.handshake.auth?.location) {
        try {
          socket.visitorLocation =
            typeof socket.handshake.auth.location === "string"
              ? JSON.parse(socket.handshake.auth.location)
              : socket.handshake.auth.location;
        } catch {
          socket.visitorLocation = null;
        }
      }

      next();
    } catch (err) {
      logger.error("Error in sales-agent socket middleware:", err);
      next(err);
    }
  });

  salesNamespace.on("connection", (socket) => {
    const sessionId = socket.sessionId;
    socket.join(sessionId);

    logger.info(`🤖 AI Sales Agent Client Connected: ${socket.id} (Session: ${sessionId})`);

    /**
     * Event: operator:join_sales_desk
     * Staff/Admin operator connects to live oversight room
     */
    socket.on("operator:join_sales_desk", (data, callback) => {
      socket.join("sales:operators");
      logger.info(`👨‍💼 Operator joined sales desk: ${socket.id}`);
      if (typeof callback === "function") callback({ success: true, room: "sales:operators" });
    });

    /**
     * Event: operator:claim_session
     * Operator takes over visitor session
     */
    socket.on("operator:claim_session", async (data, callback) => {
      const targetSessionId = data?.sessionId;
      const operatorName = data?.operatorName || socket.user?.name || "Support Specialist";
      const operatorId = data?.operatorId || socket.user?._id || socket.id;

      const result = await claimSessionByOperator(targetSessionId, String(operatorId), operatorName);

      if (result.success) {
        const meta = await getSessionMeta(targetSessionId);

        // Notify visitor in their session room with full meta
        salesNamespace.to(targetSessionId).emit("sales:handoff_initiated", {
          sessionId: targetSessionId,
          operatorName,
          message: `${operatorName} has joined the conversation.`,
          meta: {
            currentFunnel: meta.currentFunnel || "initial_intent",
            currentStep: meta.currentStep || "intent_selection",
            nextStep: meta.nextStep || "service_selection",
            missingFields: meta.missingFields || [],
            collectedData: meta.collectedData || {},
          },
          isPaused: true,
          isHandedOff: true,
          operator: { operatorId, operatorName },
        });

        // Notify operators room
        salesNamespace.to("sales:operators").emit("operator:session_claimed", {
          sessionId: targetSessionId,
          operatorId,
          operatorName,
        });
      }

      if (typeof callback === "function") callback(result);
    });

    /**
     * Event: operator:send_message
     * Operator sends manual message to visitor
     */
    socket.on("operator:send_message", async (data, callback) => {
      const targetSessionId = data?.sessionId;
      const messageText = data?.message;
      const operatorName = data?.operatorName || "Specialist";

      if (!targetSessionId || !messageText) {
        if (typeof callback === "function") callback({ success: false, error: "Missing sessionId or message" });
        return;
      }

      // 1. Emit to visitor room
      salesNamespace.to(targetSessionId).emit("sales:operator_message", {
        sessionId: targetSessionId,
        operatorName,
        message: messageText,
        timestamp: new Date().toISOString(),
      });

      // 2. Buffer message into conversation history
      await appendMessage(
        targetSessionId,
        { role: "assistant", content: `[${operatorName}]: ${messageText}` }
      );

      if (typeof callback === "function") callback({ success: true });
    });

    /**
     * Event: operator:release_session
     * Operator ends takeover and returns session to AI
     */
    socket.on("operator:release_session", async (data, callback) => {
      const targetSessionId = data?.sessionId;
      const result = await releaseSessionToAI(targetSessionId);

      if (result.success) {
        const meta = await getSessionMeta(targetSessionId);
        salesNamespace.to(targetSessionId).emit("sales:handoff_ended", {
          sessionId: targetSessionId,
          message: "Conversation has been returned to the AI assistant.",
          meta: {
            currentFunnel: meta.currentFunnel || "initial_intent",
            currentStep: meta.currentStep || "intent_selection",
            nextStep: meta.nextStep || "service_selection",
            missingFields: meta.missingFields || [],
            collectedData: meta.collectedData || {},
          },
          isPaused: false,
          isHandedOff: false,
        });
      }

      if (typeof callback === "function") callback(result);
    });

    /**
     * Event: sales:init_session
     * Restores existing conversation history, metadata, and active action cards from Redis
     */
    socket.on("sales:init_session", async (payload, callback) => {
      try {
        const history = await getSessionHistory(sessionId, 10);
        const meta = await getSessionMeta(sessionId);
        const handoffState = await getSessionHandoffState(sessionId);

        let actionCards = meta.actionCards || [];

        // If no active action cards in metadata, restore or generate the appropriate card for the current step
        if (actionCards.length === 0) {
          const liveSizes = await getLiveDumpsterSizes();
          const stepCard = generateStepActionCard(
            meta.currentFunnel || "initial_intent",
            meta.currentStep || "intent_selection",
            meta.collectedData || {},
            sessionId,
            liveSizes
          );
          if (stepCard) {
            stepCard.meta = {
              currentFunnel: meta.currentFunnel || "initial_intent",
              currentStep: meta.currentStep || "intent_selection",
              nextStep: meta.nextStep || "service_selection",
              missingFields: meta.missingFields || [],
              collectedData: meta.collectedData || {},
            };
            actionCards = [stepCard];
          }
        }

        const responseData = {
          sessionId,
          history,
          meta: {
            currentFunnel: meta.currentFunnel || "initial_intent",
            currentStep: meta.currentStep || "intent_selection",
            nextStep: meta.nextStep || "service_selection",
            missingFields: meta.missingFields || [],
            collectedData: meta.collectedData || {},
          },
          actionCards,
          isPaused: handoffState.isPaused,
          isHandedOff: handoffState.isHandedOff,
          operator: handoffState.operator,
        };

        if (typeof callback === "function") {
          callback({ success: true, data: responseData });
        } else {
          socket.emit("sales:session_state", responseData);
        }
      } catch (err) {
        logger.error(`Error initializing sales session ${sessionId}:`, err);
        if (typeof callback === "function") {
          callback({ success: false, error: err.message });
        }
      }
    });

    /**
     * Event: sales:send_message
     * Main conversation turn with streaming response and deterministic tool execution
     */
    socket.on("sales:send_message", async (data, callback) => {
      const userMessage = data?.message || (typeof data === "string" ? data : "");
      const funnel = data?.funnel || "unknown";
      const location = data?.location || socket.visitorLocation;

      if (!userMessage || typeof userMessage !== "string" || userMessage.trim().length === 0) {
        if (typeof callback === "function") {
          callback({ success: false, error: "Message cannot be empty." });
        }
        return;
      }

      // Check if session is currently paused for human operator
      const paused = await isSessionPaused(sessionId);
      if (paused) {
        // Route message directly to operators room without invoking OpenAI
        salesNamespace.to("sales:operators").emit("sales:visitor_operator_message", {
          sessionId,
          message: userMessage.trim(),
          timestamp: new Date().toISOString(),
        });

        await appendMessage(sessionId, { role: "user", content: userMessage.trim() });

        if (typeof callback === "function") {
          callback({ success: true, routedToOperator: true });
        }
        return;
      }

      // Signal typing start
      socket.emit("sales:typing_indicator", { isTyping: true, sessionId });

      try {
        const result = await orchestrateSalesConversation({
          sessionId,
          userMessage: userMessage.trim(),
          funnel,
          visitorLocation: location,
          onToken: ({ token, chunkIndex }) => {
            socket.emit("sales:stream_token", {
              token,
              chunkIndex,
              sessionId,
            });
          },
          onActionCard: (card) => {
            socket.emit("sales:action_card", {
              ...card,
              sessionId,
              meta: card.meta || null,
            });
          },
        });

        // Signal stream completion with fullResponse, actionCards, and funnel meta
        socket.emit("sales:stream_end", {
          sessionId,
          fullResponse: result.fullResponse,
          actionCards: result.actionCards,
          meta: result.meta,
        });

        if (typeof callback === "function") {
          callback({
            success: true,
            data: {
              fullResponse: result.fullResponse,
              actionCards: result.actionCards,
              meta: result.meta,
            },
          });
        }
      } catch (error) {
        logger.error(`Error in sales conversation turn for ${sessionId}:`, error);
        socket.emit("sales:error", {
          code: error?.code || "SALES_AGENT_TURN_ERROR",
          message: error?.message || "An error occurred while generating response.",
        });

        if (typeof callback === "function") {
          callback({ success: false, error: error.message });
        }
      } finally {
        socket.emit("sales:typing_indicator", { isTyping: false, sessionId });
      }
    });

    /**
     * Event: sales:user_typing
     */
    socket.on("sales:user_typing", (data) => {
      socket.to(sessionId).emit("sales:visitor_typing", {
        isTyping: Boolean(data?.isTyping),
        sessionId,
      });
    });

    /**
     * Event: sales:request_human
     * Visitor explicitly requests live human support
     */
    socket.on("sales:request_human", async (data, callback) => {
      try {
        const contact = data?.contact || {
          name: data?.name || "",
          phone: data?.phone || "",
          email: data?.email || "",
        };
        const reason = data?.reason || "Visitor requested human assistance";

        await recordVisitorHandoffRequest(sessionId, contact, reason);

        salesNamespace.to("sales:operators").emit("operator:escalation_requested", {
          sessionId,
          reason,
          contact,
          timestamp: new Date().toISOString(),
        });

        const meta = await getSessionMeta(sessionId);

        socket.emit("sales:handoff_initiated", {
          sessionId,
          operatorName: "Support Desk",
          message: "We're notifying a team member to step in. You can also leave your phone number for an instant callback.",
          meta: {
            currentFunnel: meta.currentFunnel || "initial_intent",
            currentStep: meta.currentStep || "intent_selection",
            nextStep: meta.nextStep || "service_selection",
            missingFields: meta.missingFields || [],
            collectedData: meta.collectedData || {},
          },
          isPaused: true,
          isHandedOff: true,
        });

        if (typeof callback === "function") {
          callback({ success: true, message: "Human specialist requested." });
        }
      } catch (err) {
        logger.error("Error in sales:request_human handler:", err);
        if (typeof callback === "function") {
          callback({ success: false, error: err.message });
        }
      }
    });

    /**
     * Event: sales:track_event
     * Frontend telemetries (widget opened, card clicked, checkout started)
     */
    socket.on("sales:track_event", (data, callback) => {
      let eventType = "unknown";
      let metadata = {};

      if (typeof data === "string") {
        eventType = data;
      } else if (data && typeof data === "object") {
        eventType =
          data.eventType ||
          data.eventName ||
          data.event ||
          data.event_type ||
          data.action ||
          data.name ||
          data.type ||
          "unknown";
        metadata = data.metadata || data.properties || data.data || data.payload || {};
      }

      logger.info(`📊 Sales Agent Telemetry Event [${sessionId}]: ${eventType}`, metadata);
      if (typeof callback === "function") {
        callback({ success: true, eventType });
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info(`AI Sales Agent Client Disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  return salesNamespace;
}

export default initSalesAgentSocket;
