import cron from "node-cron";
import Order from "../models/Order.js";
import User from "../models/User.js";
import TransactionModel from "../models/Transaction.js";
import logger from "../config/logger.js";
import { scheduleRentalExpiryReminders } from "./rentalExpiryReminderJob.js";
import { sendNotification } from "./notifications.js";
import { orderMessages } from "./orderMessages.js";
import { buttonTemplate } from "./emailTemplate.js";
import { accruePerDiemToInvoice } from "./commercialBilling.js";
import { quoteCommercialDumpster, normalizeCommercialSize } from "./commercialPricing.js";
import { recomputeAllOperatorGrowth } from "./growthEngine.js";
import { initSalesAgentJobs } from "../modules/sales_agent/jobs/index.js";
import { runAutomaticExchangeScan } from "../modules/builderOffer/autoExchangeJob.js";
import { runScheduledFinalPickupScan } from "../modules/builderOffer/autoFinalPickupJob.js";

async function resolveCommercialPerDiemRate(order) {
  if (order.perDiemRateSnapshot != null && Number(order.perDiemRateSnapshot) > 0) {
    return Number(order.perDiemRateSnapshot);
  }

  try {
    const size =
      order.commercialSize ||
      normalizeCommercialSize(order.dumbster?.size) ||
      "20";
    const quote = await quoteCommercialDumpster({
      companyId: order.company?._id || order.company,
      jobSiteId: order.jobSite?._id || order.jobSite,
      size,
      numDays: order.num_days || 3,
      dumbsterId: order.dumbster?._id || order.dumbster,
    });
    return Number(quote.breakdown?.perDiemRate) || 0;
  } catch (err) {
    logger.warn("commercial per-diem quote fallback", {
      orderId: order._id?.toString(),
      error: err.message,
    });
    return (
      Number(order.dumbster?.company_per_dim_rate) ||
      Number(order.dustbin?.order_extension_price) ||
      20
    );
  }
}

async function notifyOverdueCharge(order, { dayprice, newExtra }, adminUser) {
  const orderId = order._id.toString();
  const customerId =
    order.user?._id?.toString() || order.user?.toString() || "";
  if (!customerId) return;

  const copy = orderMessages.overdueDailyCharge({
    customerName: order.user?.name || "Customer",
    serviceType: order.service_type,
    order,
    dayprice,
    extra: newExtra,
  });

  const customerLink = `https://api.binsapp.ai/customer-orders?orderId=${orderId}`;
  const ownerLink = `https://api.binsapp.ai/owner-orders?orderId=${orderId}`;

  const notifyPromises = [
    sendNotification({
      user: customerId,
      to_id: customerId,
      description: copy.customer.description,
      type: "order",
      title: copy.customer.title,
      fcmtoken: order.user?.fcmtoken || "",
      order: orderId,
      email: order.user?.email || "",
      customEmailTemplate: true,
      html: buttonTemplate(
        customerLink,
        copy.customer.title,
        copy.customer.description,
      ),
      metadata: {
        action: "overdue_daily_charge",
        orderId,
        link: customerLink,
      },
    }),
  ];

  const operatorId =
    order.to_id?._id?.toString() || order.to_id?.toString() || "";
  if (operatorId) {
    notifyPromises.push(
      sendNotification({
        user: customerId,
        to_id: operatorId,
        description: copy.operator.description,
        type: "order",
        title: copy.operator.title,
        fcmtoken: order.to_id?.fcmtoken || "",
        order: orderId,
        email: order.to_id?.email || "",
        customEmailTemplate: true,
        html: buttonTemplate(
          ownerLink,
          copy.operator.title,
          copy.operator.description,
        ),
        metadata: {
          action: "overdue_daily_charge",
          orderId,
          link: ownerLink,
        },
      }),
    );
  }

  if (adminUser) {
    notifyPromises.push(
      sendNotification({
        user: customerId,
        to_id: adminUser._id.toString(),
        description: copy.admin.description,
        type: "order",
        title: copy.admin.title,
        fcmtoken: adminUser.fcmtoken || "",
        order: orderId,
        email: "",
        metadata: {
          action: "overdue_daily_charge",
          orderId,
        },
      }),
    );
  }

  await Promise.all(notifyPromises);
}

export const cronjobs = () => {
  logger.info("Cronjobs initialized");
  initSalesAgentJobs();

  /**
   * Schedule to execute daily at midnight (00:00)
   * Process daily incremental charges for overdue orders
   */
  cron.schedule("0 0 * * *", async () => {
    logger.info("Daily overdue charging cronjob triggered");

    try {
      const currentDate = new Date();

      const [orders, adminUser] = await Promise.all([
        Order.find({
          status: "accepted",
          service_type: "Dumbster",
          end_date: { $lte: currentDate },
          readyToPickup: false,
        }).populate([
          "dumbster",
          "dustbin",
          "company",
          { path: "user", select: "name email fcmtoken" },
          { path: "to_id", select: "name email fcmtoken" },
        ]),
        User.findOne({ $or: [{ type: "admin" }, { role: "admin" }] })
          .select("fcmtoken")
          .lean(),
      ]);

      if (!orders.length) {
        logger.info("No overdue orders identified for processing today");
        return;
      }

      for (const order of orders) {
        try {
          const isCommercial = Boolean(order.company);
          let dayprice = order.dustbin?.order_extension_price || 20;

          if (isCommercial) {
            dayprice = await resolveCommercialPerDiemRate(order);
            if (!dayprice || dayprice <= 0) {
              dayprice =
                Number(order.dumbster?.company_per_dim_rate) ||
                Number(order.dustbin?.order_extension_price) ||
                20;
            }
          }

          const currentExtra = order.extra || 0;
          const newExtra = currentExtra + dayprice;
          const newTotalPrice = (Number(order.price) || 0) + dayprice;

          await Order.findOneAndUpdate(
            { _id: order._id },
            { $set: { extra: newExtra, price: newTotalPrice } },
          );

          const customerId =
            order.user?._id?.toString() || order.user?.toString();

          const paymentMethod =
            order.companyPaymentMethod ||
            order.company?.paymentMethod ||
            "card";

          if (isCommercial && paymentMethod === "invoice") {
            // Accrue to invoice — do NOT wallet-debit commercial invoice accounts.
            await accruePerDiemToInvoice({
              companyId: order.company._id || order.company,
              userId: customerId,
              orderId: order._id,
              amount: dayprice,
              dayprice,
              extra: newExtra,
            });
            await TransactionModel.create({
              user: customerId,
              order: order._id,
              amount: dayprice,
              type: "debit",
              stripePaymentIntentId: null,
              metadata: {
                reason: "Commercial per-diem accrued to invoice",
                flow: "commercial_invoice_perdiem",
                orderId: order._id,
                dayprice,
                extra: newExtra,
                total_price: newTotalPrice,
              },
            });
          } else {
            await TransactionModel.create({
              user: customerId,
              order: order._id,
              amount: dayprice,
              type: "debit",
              stripePaymentIntentId: null,
              metadata: {
                reason: "Daily overdue charge for late dumpster return",
                orderId: order._id,
                dumbsterId: order.dumbster?._id || order.dumbster,
                dustbinId: order.dustbin?._id || order.dustbin,
                dayprice,
                extra: newExtra,
                total_price: newTotalPrice,
                commercial: isCommercial,
              },
            });

            await User.findOneAndUpdate(
              { _id: customerId },
              { $inc: { balance: -dayprice } },
            );
          }

          notifyOverdueCharge(order, { dayprice, newExtra }, adminUser).catch(
            (notifyErr) =>
              logger.error(
                `Overdue charge notifications failed for Order ${order._id}:`,
                notifyErr,
              ),
          );

          logger.info(
            `Successfully processed daily recurring cycle for Order: ${order._id}`,
            { commercial: isCommercial, paymentMethod, dayprice },
          );
        } catch (orderError) {
          logger.error(
            `Failed to process daily billing step for Order ${order._id}:`,
            orderError,
          );
        }
      }

      logger.info(
        `Cronjob finalized successfully. Evaluated total batches: ${orders.length}`,
      );
    } catch (error) {
      logger.error(
        "Critical architecture exception encountered within the daily cron routine:",
        error,
      );
    }
  });

  scheduleRentalExpiryReminders();

  // Commercial automatic empty & redeliver (hourly)
  cron.schedule("20 * * * *", async () => {
    try {
      logger.info("auto_exchange.scan.start");
      const result = await runAutomaticExchangeScan();
      logger.info("auto_exchange.scan.done", result);
    } catch (error) {
      logger.error("auto_exchange.scan.failed", error);
    }
  });

  // Commercial automatic final pickup on scheduled end date (hourly)
  cron.schedule("35 * * * *", async () => {
    try {
      logger.info("final_pickup.scan.start");
      const result = await runScheduledFinalPickupScan();
      logger.info("final_pickup.scan.done", result);
    } catch (error) {
      logger.error("final_pickup.scan.failed", error);
    }
  });

  // Growth platform: nightly recompute of operator profiles / tier notifications
  cron.schedule("15 0 * * *", async () => {
    try {
      logger.info("growth.daily_recompute.start");
      // notify:false — growth status is in-app only; never blast email/push
      const result = await recomputeAllOperatorGrowth({ notify: false });
      logger.info("growth.daily_recompute.done", result);
    } catch (error) {
      logger.error("growth.daily_recompute.failed", error);
    }
  });
};
