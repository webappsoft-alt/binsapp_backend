import * as builderOfferService from "../builderOffer/service.js";
import { BUILDER_OFFER_SOCKET_EVENTS } from "../../constants/builderOffer.js";
import logger from "../../config/logger.js";

/**
 * Optional socket shortcuts mirroring HTTP accept/decline.
 * Residential update-request-renter is intentionally untouched.
 */
export function initBuilderOfferSocket(io) {
  if (!io) return;

  io.on("connection", (socket) => {
    socket.on("builder-offer:accept", async (payload = {}, callback) => {
      try {
        const result = await builderOfferService.acceptPortion(
          socket.user._id,
          payload.offerId,
          payload,
        );
        if (typeof callback === "function") {
          callback({ status: "success", data: result });
        }
      } catch (error) {
        logger.error("builder-offer:accept failed", { error: error.message });
        if (typeof callback === "function") {
          callback({
            status: "error",
            message: error.message || "Accept failed",
          });
        }
      }
    });

    socket.on("builder-offer:decline", async (payload = {}, callback) => {
      try {
        const result = await builderOfferService.declinePortion(
          socket.user._id,
          payload.offerId,
          payload,
        );
        if (typeof callback === "function") {
          callback({ status: "success", data: result });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({
            status: "error",
            message: error.message || "Decline failed",
          });
        }
      }
    });

    socket.on("builder-offer:list-portions", async (_payload, callback) => {
      try {
        const data = await builderOfferService.listProviderPortions(
          socket.user._id,
        );
        if (typeof callback === "function") {
          callback({ status: "success", data });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({
            status: "error",
            message: error.message || "List failed",
          });
        }
      }
    });
  });

  // Periodic stuck-offer + expiry scans (every hour)
  const HOUR_MS = 60 * 60 * 1000;
  setInterval(() => {
    builderOfferService.scanStuckOffers().catch((err) => {
      logger.error("scanStuckOffers failed", { error: err.message });
    });
    builderOfferService.scanExpiredOffers().catch((err) => {
      logger.error("scanExpiredOffers failed", { error: err.message });
    });
  }, HOUR_MS);

  logger.info("Builder offer socket handlers registered", {
    events: Object.values(BUILDER_OFFER_SOCKET_EVENTS),
  });
}
