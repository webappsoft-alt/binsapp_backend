import logger from "../../config/logger.js";
import User from "../../models/User.js";
import Stripe from "stripe";
import config from "../../config/env.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../utils/apiError.js";
import { generateAccessToken } from "../../utils/Generator.js";
import Transaction from "../../models/Transaction.js";
import Order from "../../models/Order.js";

const stripe = new Stripe(config.get("stripe.secretKey"));
class PaymentService {
  async createPayment(userid, data) {
    // accountId is now optional destructured from data
    const {
      amount,
      accountId,
      insurance_protection,
      cancellation_insurance,
      captureMethod,
      type,
      address,
    } = data;
    console.log("address", JSON.stringify(address, null, 2));

    // Booking/dispatch MUST be a manual authorization hold with no destination
    // charge, regardless of any accountId that may leak into the payload. Only
    // the direct accept/extend flows (which pass accountId and do NOT set
    // captureMethod/type) create an automatic destination charge.
    const forceHold = captureMethod === "manual" || type === "hold";
    const useDestinationCharge = Boolean(accountId) && !forceHold;

    try {
      const user = await User.findById(userid);
      let cus_id = "";

      if (!user) {
        throw new NotFoundError("User not found");
      }

      if (!user.cus_id) {
        const customer = await stripe.customers.create();
        user.cus_id = customer.id;
        await user.save();
        cus_id = user.cus_id;
      } else {
        cus_id = user.cus_id;
      }

      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: cus_id },
        { apiVersion: "2023-10-16" },
      );

      const amountInCents = Number(amount) * 100;

      // Calculate insurance fees (convert to cents if they're provided in dollars)
      const insuranceFeesInCents =
        (Number(insurance_protection) || 0) * 100 +
        (Number(cancellation_insurance) || 0) * 100;

      // Calculate platform fee: 15% of the main amount + 100% of insurance fees
      const platformFeeFromRental = Math.round(
        (amountInCents - insuranceFeesInCents) * 0.15,
      );
      const totalPlatformFee = platformFeeFromRental + insuranceFeesInCents;

      // Total amount to charge customer: rental amount + insurance fees
      const totalChargeAmount = amountInCents;
      let taxAmountInCents = 0;
      let finalTotalInCents = totalChargeAmount;
      let calculationId = "";

      const isTaxApplicable = Boolean(config.get("isTaxApplicable"));

      if (isTaxApplicable && address) {
        const calculation = await stripe.tax.calculations.create({
          currency: "usd",
          line_items: [
            {
              amount: Number(totalChargeAmount.toFixed(0)),
              reference: "service_charge",
              tax_behavior: "exclusive",
            },
          ],
          customer_details: {
            address: {
              line1: address.line1 || "",
              city: address.city || "",
              state: address.state || "",
              postal_code: address.zip || "",
              country: address.country || "US",
            },
            address_source: "shipping",
          },
        });

        taxAmountInCents = Number(calculation.tax_amount_exclusive) || 0;
        finalTotalInCents = totalChargeAmount + taxAmountInCents;
        calculationId = calculation.id || "";
      }

      // Prepare the base configuration for Payment Intent
      const paymentIntentConfig = {
        amount: Number(finalTotalInCents.toFixed(0)),
        currency: "usd",
        customer: cus_id,
        setup_future_usage: "off_session",
        automatic_payment_methods: { enabled: true },
        // Manual capture = authorization hold (card not charged until capture).
        capture_method: useDestinationCharge ? "automatic" : "manual",
        metadata: {
          tax_calculation_id: calculationId,
          userId: userid.toString(),
          flow: useDestinationCharge ? "direct_charge" : "booking_hold",
          base_price: (totalChargeAmount / 100).toFixed(2),
          tax_amount: (taxAmountInCents / 100).toFixed(2),
        },
      };

      // Only add marketplace/split (destination charge) data for the direct
      // accept/extend flows. The booking hold never carries a destination.
      if (useDestinationCharge) {
        paymentIntentConfig.application_fee_amount =
          totalPlatformFee.toFixed(0);
        paymentIntentConfig.transfer_data = {
          destination: accountId,
        };
      }

      // Create the payment intent with the dynamic configuration
      const paymentIntent =
        await stripe.paymentIntents.create(paymentIntentConfig);

      return {
        paymentIntent: paymentIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customer: cus_id,
        paymentId: paymentIntent.id,
      };
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
  async createAccount(userid, { returnUrl } = {}) {
    try {
      const user = await User.findById(userid);
      if (!user) {
        throw new NotFoundError("User not found");
      }
      let account_id = "";
      if (!user.accountId) {
        const account = await stripe.accounts.create({
          type: "express",
        });
        account_id = account.id;
        user.accountId = account.id;
        await user.save();
      } else {
        account_id = user.accountId;
      }
      const payload = { _id: user._id, email: user.email };

      const accessToken = generateAccessToken(payload);

      const baseReturnUrl = returnUrl || config.get("redirectUrl");
      const separator = baseReturnUrl.includes("?") ? "&" : "?";
      const finalReturnUrl = `${baseReturnUrl}${separator}account_id=${account_id}&token=${accessToken}`;
      const finalRefreshUrl = baseReturnUrl;

      const accountLink = await stripe.accountLinks.create({
        account: account_id,
        refresh_url: finalRefreshUrl,
        return_url: finalReturnUrl,
        type: "account_onboarding",
      });
      return accountLink;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async verifyAccount(userid, accountId) {
    try {
      const user = await User.findById(userid);
      if (!user) {
        throw new NotFoundError("User not found");
      }
      if (user.accountId !== accountId) {
        throw new NotFoundError("Account not found");
      }
      const account = await stripe.accounts.retrieve(accountId);
      if (account.charges_enabled && account.details_submitted) {
        user.accountId_verified = true;
        await user.save();
        logger.info({
          message: "Account verified successfully",
          accountId: accountId,
          userId: userid,
        });
        return account;
      }
      throw new BadRequestError(
        "You haven't completely connect your account to Stripe..",
      );
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async createTransaction(userid, data) {
    try {
      const user = await User.findById(userid);
      if (!user) {
        throw new NotFoundError("User not found");
      }
      await Transaction.create({
        user: user._id,
        order: data.order || null,
        amount: data.amount,
        type: data.type,
        stripePaymentIntentId: data.stripePaymentIntentId,
        metadata: data.metadata,
      });

      if (data.type === "credit") {
        user.balance += data.amount;
      } else if (data.type === "debit") {
        user.balance -= data.amount;
      }
      await user.save();
      return user.balance;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getTransactions(query, options = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      minAmount = null,
      maxAmount = null,
      filter = '',
      status = '',
      sort = '',
      channel = '',
    } = options;

    try {
      const user = await User.findById(query.user);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      const parsedPage = Math.max(1, parseInt(page, 10) || 1);
      const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
      const offset = (parsedPage - 1) * parsedLimit;

      const filterConditions = [];

      // Base user constraint
      filterConditions.push({ user: query.user });

      // Type constraint (credit / debit)
      if (query.type) {
        filterConditions.push({ type: query.type });
      }

      // Date constraints
      if (query.createdAt) {
        filterConditions.push({ createdAt: query.createdAt });
      }

      // High value / minAmount filter ($500+)
      const effectiveMin =
        minAmount != null && minAmount !== ''
          ? Number(minAmount)
          : filter === 'high'
          ? 500
          : null;

      if (effectiveMin !== null && !isNaN(effectiveMin)) {
        const highOrders = await Order.find({
          $or: [
            { amount: { $gte: effectiveMin } },
            { price: { $gte: effectiveMin } },
          ],
        }).select('_id');
        const highOrderIds = highOrders.map((o) => o._id);

        filterConditions.push({
          $or: [
            { amount: { $gte: effectiveMin } },
            { order: { $in: highOrderIds } },
            { 'metadata.total_price': { $gte: effectiveMin } },
          ],
        });
      }

      // Max amount filter
      if (maxAmount != null && maxAmount !== '' && !isNaN(Number(maxAmount))) {
        filterConditions.push({ amount: { $lte: Number(maxAmount) } });
      }

      // Payment status filter (settled, pending, overdue_fee, refunded, failed)
      if (status && status !== 'all') {
        const s = String(status).toLowerCase();
        if (s === 'overdue_fee' || s === 'debit') {
          filterConditions.push({ type: 'debit' });
        } else if (s === 'refunded') {
          const refundedOrders = await Order.find({
            $or: [{ refunded: true }, { status: 'refunded' }],
          }).select('_id');
          const refundedOrderIds = refundedOrders.map((o) => o._id);
          filterConditions.push({
            $or: [
              { order: { $in: refundedOrderIds } },
              { 'metadata.refunded': true },
              { 'metadata.status': 'refunded' },
            ],
          });
        } else if (s === 'failed') {
          const failedOrders = await Order.find({
            status: 'cancelled',
          }).select('_id');
          const failedOrderIds = failedOrders.map((o) => o._id);
          filterConditions.push({
            $or: [
              { order: { $in: failedOrderIds } },
              { 'metadata.status': { $in: ['failed', 'canceled', 'cancelled'] } },
            ],
          });
        } else if (s === 'pending') {
          const pendingOrders = await Order.find({
            $or: [
              { status: { $in: ['pending', 'accepted'] } },
              { transfer: false },
              { paymentId: 'pending' },
            ],
          }).select('_id');
          const pendingOrderIds = pendingOrders.map((o) => o._id);
          filterConditions.push({
            $or: [
              { order: { $in: pendingOrderIds } },
              { 'metadata.status': 'pending' },
              { 'metadata.paymentHoldStatus': { $in: ['hold', 'authorized', 'wallet_reserved'] } },
            ],
          });
        } else if (s === 'settled' || s === 'paid' || s === 'completed') {
          filterConditions.push({
            type: 'credit',
            $or: [
              { 'metadata.status': 'succeeded' },
              { 'metadata.status': { $exists: false } },
            ],
          });
        }
      }

      // Payment channel filter (wallet vs stripe)
      if (channel && channel !== 'all') {
        const ch = String(channel).toLowerCase();
        if (ch === 'stripe' || ch === 'card') {
          filterConditions.push({
            stripePaymentIntentId: { $exists: true, $ne: null, $nin: ['', 'null'] },
          });
        } else if (ch === 'wallet' || ch === 'bins_wallet') {
          filterConditions.push({
            $or: [
              { stripePaymentIntentId: { $exists: false } },
              { stripePaymentIntentId: null },
              { stripePaymentIntentId: '' },
            ],
          });
        }
      }

      // Search constraint (order number, address, user name, phone, reason, stripe id)
      if (search && typeof search === 'string' && search.trim()) {
        const s = search.trim();
        const matchingOrders = await Order.find({
          $or: [
            { orderNumber: { $regex: s, $options: 'i' } },
            { address: { $regex: s, $options: 'i' } },
          ],
        }).select('_id');
        const orderIds = matchingOrders.map((o) => o._id);

        const matchingUsers = await User.find({
          $or: [
            { name: { $regex: s, $options: 'i' } },
            { email: { $regex: s, $options: 'i' } },
            { phone: { $regex: s, $options: 'i' } },
          ],
        }).select('_id');
        const userIds = matchingUsers.map((u) => u._id);

        filterConditions.push({
          $or: [
            { stripePaymentIntentId: { $regex: s, $options: 'i' } },
            { 'metadata.reason': { $regex: s, $options: 'i' } },
            { order: { $in: orderIds } },
            { user: { $in: userIds } },
          ],
        });
      }

      const finalQuery =
        filterConditions.length > 1
          ? { $and: filterConditions }
          : filterConditions[0] || {};

      let sortCriteria = { createdAt: -1 };
      if (sort === 'oldest' || sort === 'date_asc') {
        sortCriteria = { createdAt: 1 };
      } else if (sort === 'amount_desc' || sort === 'high_amount') {
        sortCriteria = { amount: -1 };
      } else if (sort === 'amount_asc' || sort === 'low_amount') {
        sortCriteria = { amount: 1 };
      } else if (sort === 'newest' || sort === 'date_desc') {
        sortCriteria = { createdAt: -1 };
      }

      const transactions = await Transaction.find(finalQuery)
        .populate([
          {
            path: "order",
            populate: [
              { path: "dumbster" },
              { path: "to_id" },
              { path: "user" },
            ],
          },
          { path: "user" },
        ])
        .sort(sortCriteria)
        .limit(parsedLimit)
        .skip(offset);

      const total = await Transaction.countDocuments(finalQuery);
      const totalPages = Math.ceil(total / parsedLimit);

      return {
        transactions,
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
        CurrentBalance: user.balance,
      };
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async createTopUpPayment(userid, data) {
    const { amount } = data;
    try {
      const user = await User.findById(userid);
      let cus_id = "";
      if (!user) {
        throw new NotFoundError("User not found");
      }
      if (!user.cus_id) {
        const customer = await stripe.customers.create();
        user.cus_id = customer.id;
        await user.save();
        cus_id = user.cus_id;
      } else {
        cus_id = user.cus_id;
      }
      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: cus_id },
        { apiVersion: "2023-10-16" },
      );
      const amountInCents = Number(amount) * 100; //100

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents.toFixed(0),
        currency: "usd",
        customer: cus_id,
        setup_future_usage: "off_session",
        automatic_payment_methods: { enabled: true },
      });
      return {
        paymentIntent: paymentIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customer: cus_id,
        paymentId: paymentIntent.id,
      };
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
}

export default PaymentService;
