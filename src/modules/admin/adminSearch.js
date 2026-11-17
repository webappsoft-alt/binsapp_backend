import mongoose from "mongoose";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import Dumbster from "../../models/Dumbster.js";
import Company from "../../models/Company.js";
import ProviderLead from "../../models/ProviderLead.js";
import AdminManualReviewRequests from "../../models/AdminManualReviewRequests.js";

const LIMIT = 6;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Global Admin search endpoint.
 * Searches across Orders, Users (Renters & Customers), Dumpsters, Commercial Companies,
 * Provider Leads, and Service Requests (Manual Reviews).
 */
export async function searchAdminRecords(rawQuery) {
  const q = String(rawQuery || "").trim().slice(0, 80);
  const empty = {
    query: q,
    orders: [],
    users: [],
    dumpsters: [],
    companies: [],
    leads: [],
    requests: [],
  };

  if (q.length < 2) return empty;

  const rx = new RegExp(escapeRegex(q), "i");
  const isObjectId = mongoose.Types.ObjectId.isValid(q) && q.length === 24;

  const [
    ordersResult,
    usersResult,
    dumpstersResult,
    companiesResult,
    leadsResult,
    requestsResult,
  ] = await Promise.allSettled([
    // 1. Orders
    Order.find({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(q) }] : []),
        { orderNumber: rx },
        { leadNumber: rx },
        { address: rx },
        { service_type: rx },
        { status: rx },
        { "dropoff_location.address": rx },
      ],
    })
      .select(
        "_id orderNumber leadNumber status service_type pricing totalPrice address date createdAt user rentee"
      )
      .populate("user", "name email phone comp_name")
      .populate("rentee", "name email phone")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    // 2. Users (Dumpster owners / Renters / Customers / Sub-admins)
    User.find({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(q) }] : []),
        { name: rx },
        { comp_name: rx },
        { email: rx },
        { phone: rx },
        { role: rx },
        { city: rx },
        { state: rx },
      ],
    })
      .select(
        "_id name comp_name email phone role profilePicture status city state createdAt"
      )
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    // 3. Dumpsters & Porta Potties
    Dumbster.find({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(q) }] : []),
        { name: rx },
        { size: rx },
        { service_type: rx },
        { address: rx },
        { city: rx },
        { state: rx },
        { zip: rx },
      ],
    })
      .select(
        "_id name size service_type price verify rejected address city state zip user createdAt"
      )
      .populate("user", "name comp_name email phone")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    // 4. Commercial Companies
    Company.find({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(q) }] : []),
        { companyName: rx },
        { legalBusinessName: rx },
        { dba: rx },
        { EIN: rx },
        { email: rx },
        { phone: rx },
        { address: rx },
        { city: rx },
        { state: rx },
        { status: rx },
      ],
    })
      .select(
        "_id companyName legalBusinessName dba EIN email phone status city state createdAt user"
      )
      .populate("user", "name email phone")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    // 5. Provider Leads & Estimates
    ProviderLead.find({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(q) }] : []),
        { leadNumber: rx },
        { serviceType: rx },
        { city: rx },
        { state: rx },
        { zip: rx },
        { status: rx },
      ],
    })
      .select(
        "_id leadNumber serviceType city state zip status estimatedPrice createdAt renter"
      )
      .populate("renter", "name comp_name email")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    // 6. Service Requests (Manual Reviews)
    AdminManualReviewRequests.find({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(q) }] : []),
        { service_type: rx },
        { status: rx },
        { address: rx },
      ],
    })
      .select(
        "_id service_type status address createdAt userId userAcceptedStatus"
      )
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
  ]);

  return {
    query: q,
    orders: ordersResult.status === "fulfilled" ? ordersResult.value : [],
    users: usersResult.status === "fulfilled" ? usersResult.value : [],
    dumpsters: dumpstersResult.status === "fulfilled" ? dumpstersResult.value : [],
    companies: companiesResult.status === "fulfilled" ? companiesResult.value : [],
    leads: leadsResult.status === "fulfilled" ? leadsResult.value : [],
    requests: requestsResult.status === "fulfilled" ? requestsResult.value : [],
  };
}
