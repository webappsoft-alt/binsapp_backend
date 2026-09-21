import Stripe from "stripe";
import config from "../../config/env.js";
import logger from "../../config/logger.js";
import { processStripeWebhookEvent } from "./webhookService.js";

const stripe = new Stripe(config.get("stripe.secretKey"));

export async function stripeWebhookController(req, res) {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = config.get("stripe.webhookSecret");

  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error("Webhook signature verification failed", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const result = await processStripeWebhookEvent(event);
    return res.json({ received: true, ...result });
  } catch (error) {
    logger.error(`Webhook handler error for ${event.type}`, error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
