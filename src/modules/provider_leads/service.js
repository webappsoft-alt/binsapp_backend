import mongoose from "mongoose";
import ProviderLead from "../../models/ProviderLead.js";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import Dustbin from "../../models/Dustbin.js";
import JunkRemoval from "../../models/JunkRemoval.js";
import TreeRemoval from "../../models/TreeRemoval.js";
import Notification from "../../models/Notification.js";
import OrderTimeline from "../../models/OrderTimeline.js";
import { sendNotification } from "../../utils/notifications.js";
import { io, connectedUsers } from "../../socket/socket.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../utils/apiError.js";
import logger from "../../config/logger.js";
import { sendSMS } from "../../utils/sendSMS.js";
import config from "../../config/env.js";
import { generateOTP } from "../../utils/Generator.js";

class ProviderLeadsService {
  /**
   * Create a new direct lead requested from a specific provider's profile
   */
  async createDirectLead({
    providerId,
    customerInfo,
    serviceType = "Dumbster",
    dumpsterSize = "20",
    dumpsterId = null,
    projectType = "General Cleanout",
    startDate = null,
    numDays = 3,
    placementNotes = "",
    drivewayProtection = true,
    customerId = null,
  }) {
    if (!providerId) {
      throw new BadRequestError("Provider ID is required to create a direct lead.");
    }

    if (!customerInfo?.name || !customerInfo?.email) {
      throw new BadRequestError("Customer name and email are required.");
    }

    // Verify provider exists
    const provider = await User.findById(providerId);
    if (!provider) {
      throw new NotFoundError("Selected bin provider does not exist.");
    }

    // Verify provider service qualification (active inventory, insurance COI, license)
    if (serviceType === "Dumbster") {
      const dumpsterBins = await Dustbin.find({
        user: provider._id,
        dumbster: { $ne: null },
        status: "active",
        verify: true,
      })
        .populate("dumbster")
        .lean();
      if (dumpsterBins.length === 0) {
        throw new BadRequestError("This provider currently has no active dumpster fleet listed.");
      }
      if (dumpsterBins.length > 0 && dumpsterSize) {
        const availableSizes = dumpsterBins
          .map((b) => String(b.dumbster?.size || "").trim().toLowerCase())
          .filter(Boolean);
        const reqSize = String(dumpsterSize).trim().toLowerCase();
        if (
          availableSizes.length > 0 &&
          !availableSizes.some((s) => s === reqSize || s.includes(reqSize) || reqSize.includes(s))
        ) {
          throw new BadRequestError(`This provider does not offer a ${dumpsterSize} yard dumpster.`);
        }
      }
    } else if (serviceType === "Junk Removal") {
      const junkProfile = await JunkRemoval.findOne({ userId: provider._id }).lean();
      const hasInsurance = Boolean(
        provider.isInsured ||
        provider.insuranceFile ||
        (junkProfile && (junkProfile.COI || junkProfile.isCOIAApproved))
      );
      const isApprovedJunk = Boolean(
        (junkProfile && junkProfile.status !== "rejected" && hasInsurance) ||
        (provider.junkRemoval && hasInsurance) ||
        (provider.access_types === "junkRemoval" && hasInsurance)
      );
      if (!isApprovedJunk) {
        throw new BadRequestError("This provider is not currently qualified or insured for Junk Removal.");
      }
    } else if (serviceType === "Tree Removal") {
      const treeProfile = await TreeRemoval.findOne({ userId: provider._id }).lean();
      const hasTreeLicense = Boolean(
        treeProfile?.Tree_removal_license ||
        treeProfile?.isTreeRemovalLicenseApproved ||
        (Array.isArray(treeProfile?.drivers_license) && treeProfile.drivers_license.length > 0)
      );
      const hasTreeInsurance = Boolean(
        treeProfile?.COI || treeProfile?.isCOIApproved || provider.isInsured
      );
      const hasTreeRemoval = Boolean(
        (treeProfile && treeProfile.status !== "rejected" && (hasTreeLicense || hasTreeInsurance)) ||
        provider.treeRemoval ||
        provider.access_types === "treeRemoval"
      );
      if (!hasTreeRemoval) {
        throw new BadRequestError("This provider is not currently licensed or certified for Tree Services.");
      }
    } else if (serviceType === "Porta Potty") {
      const portaBins = await Dustbin.find({
        user: provider._id,
        portaPotty: { $ne: null },
        status: "active",
        verify: true,
      }).lean();
      if (portaBins.length === 0) {
        throw new BadRequestError("This provider does not currently offer active Porta Potty sanitation services.");
      }
    }

    // Attempt to link customer if customerId provided, or check if email matches a user
    let linkedCustomerId = customerId;
    if (!linkedCustomerId && customerInfo?.email) {
      const existingUser = await User.findOne({
        email: customerInfo.email.trim().toLowerCase(),
      });
      if (existingUser) {
        linkedCustomerId = existingUser._id;
      }
    }

    const lead = new ProviderLead({
      provider: provider._id,
      customer: linkedCustomerId || null,
      customerInfo: {
        name: customerInfo.name.trim(),
        email: customerInfo.email.trim().toLowerCase(),
        phone: customerInfo.phone ? customerInfo.phone.trim() : "",
        address: customerInfo.address ? customerInfo.address.trim() : "",
        city: customerInfo.city ? customerInfo.city.trim() : "",
        state: customerInfo.state ? customerInfo.state.trim() : "",
        zip: customerInfo.zip ? customerInfo.zip.trim() : "",
        coordinates: customerInfo.coordinates || undefined,
      },
      serviceType,
      dumpsterSize: String(dumpsterSize),
      dumpster: dumpsterId || null,
      projectType,
      startDate: startDate ? new Date(startDate) : null,
      numDays: Number(numDays) > 0 ? Number(numDays) : 3,
      placementNotes,
      drivewayProtection: drivewayProtection !== false,
      status: "pending",
      source: "provider_profile",
    });

    await lead.save();

    // 1. In-app Notification + FCM Push for provider
    try {
      const leadTitle = `New Direct Lead: ${lead.leadNumber}`;
      const leadBody = `${lead.customerInfo.name} requested a direct quote for a ${lead.dumpsterSize} Yard ${lead.serviceType || 'dumpster'} in ${lead.customerInfo.city || 'your service area'}. Tap to generate an estimate.`;

      await sendNotification({
        user: linkedCustomerId || provider._id,
        to_id: provider._id,
        type: "provider_lead",
        title: leadTitle,
        description: leadBody,
        fcmtoken: provider.fcmtoken || "",
        email: provider.email || "",
        isImportant: true,
        metadata: {
          kind: "provider_lead",
          leadId: lead._id.toString(),
          leadNumber: lead.leadNumber,
          customerName: lead.customerInfo.name,
          serviceType: lead.serviceType || "Dumbster",
          dumpsterSize: String(lead.dumpsterSize || ""),
        },
      });
    } catch (notifErr) {
      logger.warn("Failed to create provider lead notification:", notifErr);
    }

    // 2. Real-time socket notification to provider
    try {
      if (io) {
        const payload = {
          leadId: lead._id,
          leadNumber: lead.leadNumber,
          customerName: lead.customerInfo.name,
          dumpsterSize: lead.dumpsterSize,
          serviceType: lead.serviceType,
          city: lead.customerInfo.city,
          createdAt: lead.createdAt,
        };

        const providerSocketId = connectedUsers?.get(provider._id.toString());
        const providerTarget = providerSocketId || `user_${provider._id.toString()}`;

        io.to(providerTarget).emit("new_provider_lead", payload);
        io.to(providerTarget).emit("leads:count_update", { type: "increment" });


      }
    } catch (sockErr) {
      logger.warn("Failed to emit socket for provider lead:", sockErr);
    }

    // 3. Direct SMS notifications for new lead (to Provider and Customer confirmation)
    try {
      const rawFrontendBase =
        config.get("redirectFrontendUrl") ||
        config.get("redirectUrl") ||
        "https://binsapp.ai";
      const frontendBase =
        rawFrontendBase.includes("localhost") || rawFrontendBase.includes("127.0.0.1")
          ? "https://binsapp.ai"
          : rawFrontendBase;

      // (A) SMS to Provider
      if (provider.phone) {
        const provMsg = `BINS APP: New direct quote lead #${lead.leadNumber} received from ${lead.customerInfo.name} for a ${lead.dumpsterSize} Yard ${lead.serviceType || 'dumpster'} in ${lead.customerInfo.city || 'your service area'}. Submit estimate: ${frontendBase}/renter/leads`;
        await sendSMS({
          to: provider.phone,
          body: provMsg,
          type: "lead_alert",
          metadata: { leadId: lead._id.toString(), leadNumber: lead.leadNumber, role: "provider" },
        }).catch((err) => logger.warn("Failed to send lead SMS to provider:", err));
      }

      // (B) SMS Confirmation to Customer
      const customerPhone =
        lead.customerInfo?.phone ||
        (linkedCustomerId ? (await User.findById(linkedCustomerId))?.phone : null);
      if (customerPhone) {
        const provName =
          provider.comp_name?.trim() || provider.name?.trim() || "the verified provider";
        const custMsg = `BINS APP: Hi ${lead.customerInfo.name}, your quote request #${lead.leadNumber} has been received by ${provName}. You will receive an estimate shortly!`;
        await sendSMS({
          to: customerPhone,
          body: custMsg,
          type: "lead_alert",
          metadata: { leadId: lead._id.toString(), leadNumber: lead.leadNumber, role: "customer" },
        }).catch((err) => logger.warn("Failed to send lead confirmation SMS to customer:", err));
      }
    } catch (smsErr) {
      logger.warn("Direct lead SMS dispatch error:", smsErr);
    }

    return lead;
  }

  /**
   * Fetch leads for a specific provider
   */
  async getProviderLeads(providerId, { status = "all", page = 1, limit = 20 } = {}) {
    const query = { provider: providerId };
    if (status && status !== "all") {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [leads, total, counts] = await Promise.all([
      ProviderLead.find(query)
        .populate("customer", "name email phone profilePicture")
        .populate("order", "status total_price start_date end_date to_id")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ProviderLead.countDocuments(query),
      ProviderLead.aggregate([
        { $match: { provider: new mongoose.Types.ObjectId(providerId) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const statusCounts = {
      all: 0,
      pending: 0,
      estimate_sent: 0,
      converted: 0,
      declined: 0,
    };

    counts.forEach((c) => {
      statusCounts[c._id] = c.count;
      statusCounts.all += c.count;
    });

    return {
      leads,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
      counts: statusCounts,
    };
  }

  /**
   * Fetch leads created by a customer
   */
  async getCustomerLeads({ customerId = null, email = null } = {}) {
    const orQuery = [];
    if (customerId) {
      orQuery.push({ customer: customerId });
    }
    if (email) {
      orQuery.push({ "customerInfo.email": email.trim().toLowerCase() });
    }

    if (orQuery.length === 0) {
      return [];
    }

    const leads = await ProviderLead.find({ $or: orQuery })
      .populate("provider", "name comp_name profilePicture rating total_reviews phone address city")
      .populate("order", "status total_price start_date end_date")
      .sort({ createdAt: -1 });

    return leads;
  }

  /**
   * Fetch single lead details
   */
  async getLeadById(leadId) {
    let lead = null;
    if (mongoose.Types.ObjectId.isValid(leadId)) {
      lead = await ProviderLead.findById(leadId)
        .populate("provider", "name comp_name profilePicture rating total_reviews phone email address city")
        .populate("customer", "name email phone profilePicture")
        .populate("order", "orderNumber status total_price start_date end_date to_id source");
    }

    if (!lead) {
      lead = await ProviderLead.findOne({ leadNumber: leadId })
        .populate("provider", "name comp_name profilePicture rating total_reviews phone email address city")
        .populate("customer", "name email phone profilePicture")
        .populate("order", "orderNumber status total_price start_date end_date to_id source");
    }

    if (!lead) {
      throw new NotFoundError("Lead record not found.");
    }

    const leadObj = lead.toObject ? lead.toObject() : lead;
    if (leadObj.provider) {
      leadObj.provider.displayName =
        leadObj.provider.comp_name?.trim() ||
        leadObj.provider.name?.trim() ||
        "Verified Operator";
    }

    return leadObj;
  }

  /**
   * Provider sends or updates an estimate for a direct lead
   */
  async createOrUpdateEstimate(
    leadId,
    providerId,
    {
      estimatedPrice,
      includedTons = 2,
      rentalDays = 3,
      extraDayPrice = 20,
      overagePerTon = 75,
      deliveryFee = 0,
      validDays = 7,
      providerNotes = "",
    }
  ) {
    const lead = await ProviderLead.findById(leadId);
    if (!lead) {
      throw new NotFoundError("Lead record not found.");
    }

    if (lead.provider.toString() !== providerId.toString()) {
      throw new ForbiddenError("You are not authorized to quote this lead.");
    }

    if (!estimatedPrice || Number(estimatedPrice) <= 0) {
      throw new BadRequestError("Valid estimated price is required.");
    }

    const validUntilDate = new Date();
    validUntilDate.setDate(validUntilDate.getDate() + (Number(validDays) || 7));

    lead.estimate = {
      estimatedPrice: Math.round(Number(estimatedPrice)),
      includedTons: Number(includedTons) || 2,
      rentalDays: Number(rentalDays) || lead.numDays || 3,
      extraDayPrice: Number(extraDayPrice) || 20,
      overagePerTon: Number(overagePerTon) || 75,
      deliveryFee: Number(deliveryFee) || 0,
      validUntil: validUntilDate,
      providerNotes: providerNotes?.trim() || "",
      sentAt: new Date(),
      respondedAt: null,
    };

    lead.status = "estimate_sent";
    await lead.save();

    // Notify customer
    try {
      const provider = await User.findById(providerId);
      const providerName = provider?.comp_name || provider?.name || "The Hauler";

      let customerUser = null;
      if (lead.customer) {
        customerUser = await User.findById(lead.customer);
      } else if (lead.customerInfo?.email) {
        customerUser = await User.findOne({
          email: lead.customerInfo.email.trim().toLowerCase(),
        });
      }

      const estimateTitle = `Direct Estimate Received: ${lead.leadNumber}`;
      const estimateBody = `${providerName} sent you an estimate of $${lead.estimate.estimatedPrice} for your ${lead.dumpsterSize} Yard ${lead.serviceType || 'dumpster'} request. Tap to view and accept.`;

      if (customerUser) {
        if (!lead.customer) {
          lead.customer = customerUser._id;
          await lead.save();
        }

        await sendNotification({
          user: providerId,
          to_id: customerUser._id,
          type: "provider_estimate",
          title: estimateTitle,
          description: estimateBody,
          fcmtoken: customerUser.fcmtoken || "",
          email: customerUser.email || lead.customerInfo.email || "",
          isImportant: true,
          metadata: {
            kind: "provider_estimate",
            leadId: lead._id.toString(),
            leadNumber: lead.leadNumber,
            providerName,
            estimatedPrice: String(lead.estimate.estimatedPrice),
          },
        });

        if (io) {
          const payload = {
            leadId: lead._id,
            leadNumber: lead.leadNumber,
            providerName,
            estimatedPrice: lead.estimate.estimatedPrice,
          };

          const customerSocketId = connectedUsers?.get(customerUser._id.toString());
          const customerTarget = customerSocketId || `user_${customerUser._id.toString()}`;

          io.to(customerTarget).emit("new_provider_estimate", payload);
          io.to(customerTarget).emit("quotes:count_update", { type: "new_estimate" });


        }
      } else if (lead.customerInfo?.email) {
        // Guest customer: send notification email
        await sendNotification({
          user: providerId,
          to_id: providerId,
          type: "provider_estimate",
          title: estimateTitle,
          description: estimateBody,
          noti: false,
          email: lead.customerInfo.email,
          isImportant: true,
        }).catch((err) => logger.warn("Guest estimate email failed:", err));
      }

      // Direct SMS Notification to Customer with Estimate details and link to view/accept
      try {
        const rawFrontendBase =
          config.get("redirectFrontendUrl") ||
          config.get("redirectUrl") ||
          "https://binsapp.ai";
        const frontendBase =
          rawFrontendBase.includes("localhost") || rawFrontendBase.includes("127.0.0.1")
            ? "https://binsapp.ai"
            : rawFrontendBase;

        const customerPhone =
          lead.customerInfo?.phone || customerUser?.phone || "";

        if (customerPhone) {
          const estimateLink = `${frontendBase}/bins-providers/estimate/${lead._id}`;
          const estimateSmsBody = `BINS APP: ${providerName} sent you an estimate of $${lead.estimate.estimatedPrice} for your ${lead.dumpsterSize} Yard ${lead.serviceType || 'dumpster'} request (${lead.estimate.rentalDays} days rental). Review & accept your quote here: ${estimateLink}`;

          await sendSMS({
            to: customerPhone,
            body: estimateSmsBody,
            type: "estimate_sent",
            metadata: { leadId: lead._id.toString(), leadNumber: lead.leadNumber, estimatedPrice: lead.estimate.estimatedPrice },
          }).catch((err) =>
            logger.warn("Failed to send estimate SMS to customer:", err)
          );
        }
      } catch (smsErr) {
        logger.warn("Estimate SMS dispatch error:", smsErr);
      }
    } catch (notifErr) {
      logger.warn("Failed to notify customer of estimate:", notifErr);
    }

    return lead;
  }

  /**
   * Customer accepts estimate -> Creates Order assigned EXCLUSIVELY to this provider!
   */
  async acceptEstimate(leadId, { customerId = null, customerEmail = null } = {}) {
    const lead = await ProviderLead.findById(leadId).populate("provider");
    if (!lead) {
      throw new NotFoundError("Lead record not found.");
    }

    if (lead.status !== "estimate_sent") {
      throw new BadRequestError(`Cannot accept estimate in status '${lead.status}'. Estimate must be in 'estimate_sent'.`);
    }

    if (!lead.estimate?.estimatedPrice) {
      throw new BadRequestError("This lead does not have a valid estimate to accept.");
    }

    // Verify customer or resolve user account
    let orderUserId = customerId || lead.customer;
    if (!orderUserId && (customerEmail || lead.customerInfo?.email)) {
      const emailToMatch = (customerEmail || lead.customerInfo.email).trim().toLowerCase();
      let user = await User.findOne({ email: emailToMatch });
      if (!user) {
        // Create customer user profile
        user = new User({
          name: lead.customerInfo.name,
          email: emailToMatch,
          phone: lead.customerInfo.phone || "",
          address: lead.customerInfo.address || lead.customerInfo.city || "",
          role: "rentee",
          type: "rentee",
          status: "active",
        });
        await user.save();
      }
      orderUserId = user._id;
      lead.customer = user._id;
    }

    if (!orderUserId) {
      throw new BadRequestError("Customer account is required to generate the order.");
    }

    const providerId = lead.provider._id || lead.provider;
    const startDate = lead.startDate || new Date();
    const rentalDays = lead.estimate.rentalDays || lead.numDays || 3;
    const endDate = new Date(startDate.getTime() + rentalDays * 86400000);
    const orderTotal = lead.estimate.estimatedPrice;

    const orderNumber = generateOTP(5, { alphabet: true, numeric: true });

    // Create the Order EXCLUSIVELY assigned to this provider with accepted status!
    const newOrder = new Order({
      user: orderUserId,
      to_id: providerId, // Directly assigned to this provider!
      userIds: [providerId], // ONLY this provider receives it!
      accepted_by: [providerId], // Marked as accepted by this provider
      orderNumber,
      source: "direct_lead", // Marks that this order originated from direct profile lead!
      leadId: lead._id,
      leadNumber: lead.leadNumber,
      service_type: lead.serviceType || "Dumbster",
      dumbster: lead.dumpster || undefined,
      start_date: startDate,
      end_date: endDate,
      num_days: rentalDays,
      price: orderTotal,
      amount: orderTotal,
      total_price: orderTotal,
      address: lead.customerInfo.address || `${lead.customerInfo.city}, ${lead.customerInfo.state}` || "Service Territory",
      location: lead.customerInfo.coordinates && lead.customerInfo.coordinates.length >= 2
        ? { type: "Point", coordinates: lead.customerInfo.coordinates }
        : undefined,
      placementNote: lead.placementNotes || "",
      driveaway: lead.drivewayProtection !== false,
      status: "accepted", // Immediately active for provider and customer!
      payment_type: "stripe",
      paymentId: `EST_ACCEPT_${lead.leadNumber}_${Date.now()}`,
    });

    await newOrder.save();

    // Increment provider order statistics
    try {
      await User.findByIdAndUpdate(providerId, {
        $inc: {
          "ordersDetails.total": 1,
          "ordersDetails.accepted": 1,
        },
      });
    } catch (userStatErr) {
      logger.warn("Failed to increment provider ordersDetails:", userStatErr);
    }

    // Record order timeline entry
    try {
      await OrderTimeline.create({
        order: newOrder._id,
        orderDeatil: newOrder,
        title: "Order Accepted via Direct Quote",
        description: `Direct estimate #${lead.leadNumber} ($${orderTotal}) was accepted. Order is confirmed.`,
        date: new Date(),
      });
    } catch (tlErr) {
      logger.warn("Failed to create OrderTimeline for direct lead:", tlErr);
    }

    // Update lead status
    lead.status = "converted";
    lead.order = newOrder._id;
    lead.estimate.respondedAt = new Date();
    await lead.save();

    // Notify provider that direct lead converted into an order!
    try {
      const providerUser = await User.findById(providerId);
      const notifTitle = `Direct Lead Converted! Order Created (${lead.leadNumber})`;
      const notifBody = `${lead.customerInfo.name} accepted your $${orderTotal} estimate. Order #${orderNumber} has been created and assigned directly to you.`;

      await sendNotification({
        user: orderUserId,
        to_id: providerId,
        type: "order",
        order: newOrder._id,
        title: notifTitle,
        description: notifBody,
        fcmtoken: providerUser?.fcmtoken || "",
        email: providerUser?.email || "",
        isImportant: true,
        metadata: {
          kind: "order_created",
          orderId: newOrder._id.toString(),
          orderNumber,
          leadId: lead._id.toString(),
          leadNumber: lead.leadNumber,
        },
      });

      // Also notify customer with push notification and in-app confirmation
      try {
        const customerUser = await User.findById(orderUserId);
        const custTitle = `Order Confirmed! (#${orderNumber})`;
        const custBody = `Your estimate acceptance is confirmed. Order #${orderNumber} has been scheduled with ${providerUser?.comp_name || providerUser?.name || "your provider"}.`;

        await sendNotification({
          user: providerId,
          to_id: orderUserId,
          type: "order",
          order: newOrder._id,
          title: custTitle,
          description: custBody,
          fcmtoken: customerUser?.fcmtoken || "",
          email: customerUser?.email || lead.customerInfo?.email || "",
          isImportant: true,
          metadata: {
            kind: "order_created",
            orderId: newOrder._id.toString(),
            orderNumber,
            leadId: lead._id.toString(),
            leadNumber: lead.leadNumber,
          },
        });
      } catch (custNotifErr) {
        logger.warn("Failed to notify customer of confirmed order:", custNotifErr);
      }

      if (io) {
        const payload = {
          leadId: lead._id,
          leadNumber: lead.leadNumber,
          orderId: newOrder._id,
          orderNumber,
          customerName: lead.customerInfo.name,
          totalPrice: orderTotal,
        };

        const providerSocketId = connectedUsers?.get(providerId.toString());
        const providerTarget = providerSocketId || `user_${providerId.toString()}`;

        io.to(providerTarget).emit("direct_lead_accepted", payload);
        io.to(providerTarget).emit("order_created", newOrder);
        io.to(providerTarget).emit("update-request-renter", {
          success: true,
          order: newOrder,
          orderId: newOrder._id.toString(),
          navigate: false,
          title: "Direct Lead Converted",
          message: `${lead.customerInfo.name} accepted your quote.`,
        });
        io.to(providerTarget).emit("leads:count_update", { type: "decrement" });

        // Also notify customer socket
        const customerSocketId = connectedUsers?.get(orderUserId.toString());
        const customerTarget = customerSocketId || `user_${orderUserId.toString()}`;

        io.to(customerTarget).emit("update-request-rentee", {
          success: true,
          order: newOrder,
          orderId: newOrder._id.toString(),
          title: "Quote Accepted",
          message: "Your estimate has been accepted and order created.",
        });
        io.to(customerTarget).emit("quotes:count_update", { type: "decrement" });
      }

      // 4. SMS Confirmation to Customer & Provider on Estimate Acceptance
      try {
        const rawFrontendBase =
          config.get("redirectFrontendUrl") ||
          config.get("redirectUrl") ||
          "https://binsapp.ai";
        const frontendBase =
          rawFrontendBase.includes("localhost") || rawFrontendBase.includes("127.0.0.1")
            ? "https://binsapp.ai"
            : rawFrontendBase;

        const providerName =
          providerUser?.comp_name || providerUser?.name || "your provider";

        // (A) SMS to Customer
        const customerPhone =
          lead.customerInfo?.phone || customerUser?.phone || "";
        if (customerPhone) {
          const trackLink = `${frontendBase}/orders/track`;
          const custSmsBody = `BINS APP: Your estimate #${lead.leadNumber} with ${providerName} is confirmed! Order #${orderNumber} has been scheduled. Track order: ${trackLink}`;
          await sendSMS({
            to: customerPhone,
            body: custSmsBody,
            type: "estimate_accepted",
            metadata: { leadId: lead._id.toString(), orderId: newOrder._id.toString(), role: "customer" },
          }).catch((err) =>
            logger.warn("Failed to send order confirmation SMS to customer:", err)
          );
        }

        // (B) SMS to Provider
        if (providerUser?.phone) {
          const provSmsBody = `BINS APP: Great news! ${lead.customerInfo.name} accepted your $${orderTotal} estimate. Order #${orderNumber} is assigned to you. View at: ${frontendBase}/renter`;
          await sendSMS({
            to: providerUser.phone,
            body: provSmsBody,
            type: "estimate_accepted",
            metadata: { leadId: lead._id.toString(), orderId: newOrder._id.toString(), role: "provider" },
          }).catch((err) =>
            logger.warn("Failed to send estimate acceptance SMS to provider:", err)
          );
        }
      } catch (smsErr) {
        logger.warn("Estimate acceptance SMS dispatch error:", smsErr);
      }
    } catch (notifErr) {
      logger.warn("Failed to notify provider of accepted estimate:", notifErr);
    }

    return { lead, order: newOrder };
  }

  /**
   * Customer declines estimate
   */
  async declineEstimate(leadId, reason = "") {
    const lead = await ProviderLead.findById(leadId);
    if (!lead) {
      throw new NotFoundError("Lead record not found.");
    }

    lead.status = "declined";
    lead.estimate.respondedAt = new Date();
    if (reason) {
      lead.placementNotes = `${lead.placementNotes || ''} [Customer Declined: ${reason}]`.trim();
    }
    await lead.save();

    try {
      const providerUser = await User.findById(lead.provider);
      const title = `Estimate Declined: ${lead.leadNumber}`;
      const description = `Customer ${lead.customerInfo.name} declined the estimate for ${lead.leadNumber}.`;

      await sendNotification({
        user: lead.customer || lead.provider,
        to_id: lead.provider,
        type: "provider_lead",
        title,
        description,
        fcmtoken: providerUser?.fcmtoken || "",
        email: providerUser?.email || "",
        isImportant: false,
        metadata: {
          kind: "estimate_declined",
          leadId: lead._id.toString(),
          leadNumber: lead.leadNumber,
        },
      });

      if (io) {
        const payload = {
          leadId: lead._id,
          leadNumber: lead.leadNumber,
          customerName: lead.customerInfo.name,
        };

        const providerSocketId = connectedUsers?.get(lead.provider.toString());
        const providerTarget = providerSocketId || `user_${lead.provider.toString()}`;

        io.to(providerTarget).emit("provider_lead_declined", payload);
        io.to(providerTarget).emit("leads:count_update", { type: "decrement" });
      }
    } catch (err) {
      logger.warn("Failed to notify provider of declined estimate:", err);
    }

    return lead;
  }
}

export default new ProviderLeadsService();
