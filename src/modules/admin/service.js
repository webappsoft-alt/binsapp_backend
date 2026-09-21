import mongoose from "mongoose";
import Dustbin from "../../models/Dustbin.js";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import logger from "../../config/logger.js";
import Support from "../../models/Support.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../utils/apiError.js";
import bcrypt from "bcrypt";
import AdminManualReviewRequests from "../../models/AdminManualReviewRequests.js";
// import { sendNotification } from "../../utils/notifications.js";
import { sendAdminEmailToUser } from "../../utils/emailservice.js";
import {
  serviceRejectedTemplate,
  serviceApprovedTemplate,
} from "../../utils/emailTemplate.js";
import { sendNotification } from "../../utils/notifications.js";
import { io } from "../../socket/socket.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generateOTP,
} from "../../utils/Generator.js";
import moment from "moment";
import { Worker } from "worker_threads";
import jobQueue from "../../utils/jobQueue.js";
import path from "path";
import { fileURLToPath } from "url";
import JunkRemoval from "../../models/JunkRemoval.js";
import TreeRemoval from "../../models/TreeRemoval.js";
import Company from "../../models/Company.js";
import JobSite from "../../models/JobSites.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
class adminService {
  constructor() {
    this.worker = null;
    this.initQueueProcessor();
    this.initWorker();
  }

  initWorker() {
    // Resolve absolute path to the worker processor
    const workerPath = path.resolve(
      process.cwd(),
      "./src/utils/notificationProcessor.js",
    );
    this.worker = new Worker(workerPath);

    this.worker.on("error", (err) => {
      logger.error("Notification Worker Error:", err);
      // Restart worker on crash
      setTimeout(() => this.initWorker(), 1000);
    });
  }

  initQueueProcessor() {
    // We only attach this listener once
    jobQueue.processJobs(async (job) => {
      return new Promise((resolve, reject) => {
        if (!this.worker) return reject(new Error("Worker not initialized"));

        const messageHandler = (res) => {
          this.worker.off("error", errorHandler);
          resolve(res);
        };
        const errorHandler = (err) => {
          this.worker.off("message", messageHandler);
          reject(err);
        };
        this.worker.once("message", messageHandler);
        this.worker.once("error", errorHandler);
        this.worker.postMessage(job);
      });
    });
  }

  async adminLogin(email, password) {
    try {
      const user = await User.findOne({
        email: email.toLowerCase(),
        role: "admin",
      });
      if (!user) {
        throw new NotFoundError("User not found");
      }
      const isPasswordValid = await bcrypt.compare(
        password,
        "$2a$12$52p0Q2jiVrBK6DYGlQOa/.yM2RncNdU2xfHl4KRHoPU1Zu3EhiJnO", // 123456
      );
      if (!isPasswordValid) {
        throw new BadRequestError("Invalid password");
      }
      const payload = {
        _id: user._id,
        role: user.role,
        // type: user.type,
      };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      return { user, accessToken, refreshToken };
    } catch (error) {
      logger.error("method adminLogin in adminService failed", error);
      throw error;
    }
  }
  async getAllUsers(query, { page, limit }) {
    try {
      const users = await User.find(query)
        .populate(["company", "junkRemoval", "treeRemoval"])
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      const totalUsers = await User.countDocuments(query);
      const pagination = {
        page,
        limit,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      };
      return { users, pagination };
    } catch (error) {
      logger.error("method getAllUsers in adminService failed", error);
      throw error;
    }
  }
  async adminDashboard() {
    try {
      const totalUsers = await User.countDocuments({
        $or: [{ role: "rentee" }, { type: "rentee" }],
        status: { $ne: "deleted" },
      });

      // Get users registered yesterday
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const startMonth = moment().startOf("month");
      const startDate = moment().startOf("year");
      const todayEnd = moment().endOf("day");

      const totalRenterUsers = await User.countDocuments({
        $or: [{ role: "renter" }, { type: "renter" }],
        status: { $ne: "deleted" },
      });

      const totalDustbins = await Dustbin.countDocuments({
        status: "active",
        verify: true,
        rejected: false,
      });
      const totalQuantityResult = await Dustbin.aggregate([
        {
          $match: {
            verify: true,
            status: "active",
            rejected: false,
          },
        },
        {
          $group: {
            _id: null,
            totalQuantity: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$quantity", null] }, // null or missing
                      { $eq: ["$quantity", 0] }, // zero
                    ],
                  },
                  1, // replace with minimum 1
                  "$quantity", // otherwise use actual value
                ],
              },
            },
          },
        },
      ]);

      const totalQuantity =
        totalQuantityResult.length > 0
          ? totalQuantityResult[0].totalQuantity
          : 0;

      const totalOrder = await Order.find({ status: "completed" });

      const thismothOrder = await Order.find({
        createdAt: { $gte: startMonth, $lte: todayEnd },
        status: "completed",
      })
        .select("status createdAt price")
        .lean();

      const now = new Date();
      let dates = [];
      for (let i = 0; i < 12; i++) {
        let date = new Date(now);
        date.setMonth(now.getMonth() - i);
        dates.unshift(date.toISOString());
      }

      const orders = await Order.find({
        createdAt: { $gte: startDate, $lte: todayEnd },
        status: "completed",
      })
        .select("status createdAt price")
        .lean();

      // Initialize the graph array
      let graph = dates.map((date) => ({ x: date, y: 0, price: 0 }));

      // Increment the y value for the correct date ranges
      orders.forEach((order) => {
        const index = this.findDateIndex(order.createdAt, dates);
        if (index !== -1 && index < graph.length) {
          graph[index].y += 1;
          graph[index].price = Number(
            Number(graph[index].price) + Number(order?.price || 0),
          ).toFixed(0);
        }
      });

      let newGraph = graph.map((obj) => {
        return {
          ["x"]: moment(obj.x).format("MMM"),
          ["y"]: obj.y,
          price: obj.price,
        };
      });
      return {
        success: true,
        graph: newGraph,
        rentee: totalUsers,
        renter: totalRenterUsers,
        dustbins: totalDustbins,
        completeorder: totalOrder.length,
        totalSales: totalOrder.reduce((a, b) => a + b.price, 0),
        thismothOrder: thismothOrder.length,
        thismothSales: thismothOrder.reduce((a, b) => a + b.price, 0),
        totalBinQuantity: totalQuantity,
      };
    } catch (error) {
      logger.error("method adminDashboard in adminService failed", error);
      throw error;
    }
  }
  async adminDeleteUser(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new NotFoundError("The User with the given ID was not found.");
      }

      const randomSuffix = generateOTP(10, { numeric: true, alphabet: true });
      user.email = `${user.email}_deleted_${randomSuffix}`;
      // user.phone = `${user.phone || ""}_deleted_${randomSuffix}`;
      user.status = "deleted";
      await user.save();
      await Dustbin.updateMany({ user: userId }, { status: "deactive" });
      return user;
    } catch (error) {
      logger.error("method adminDeleteUser in adminService failed", error);
      throw error;
    }
  }
  async adminUpdateUser(pathId, data) {
    // console.log("data", data);
    try {
      const updates = { ...data };

      // Cast radius to Number if provided
      if (updates.radius !== undefined) {
        updates.radius = Number(updates.radius);
      }

      // Build location coordinates from lat/lng if provided
      if (updates.lat !== undefined || updates.lng !== undefined) {
        const existingUser = await User.findById(pathId).lean();
        const currentCoords = existingUser?.location?.coordinates || [0, 0];
        updates.location = {
          type: "Point",
          coordinates: [
            updates.lng !== undefined ? Number(updates.lng) : currentCoords[0],
            updates.lat !== undefined ? Number(updates.lat) : currentCoords[1],
          ],
        };
      }

      // Direct atomic update — bypasses model instance issues entirely
      // .lean() returns raw MongoDB doc, bypassing Mongoose schema hydration
      console.log("Final $set payload:", JSON.stringify(updates, null, 2));
      const user = await User.findByIdAndUpdate(
        pathId,
        { $set: updates },
        { new: true, runValidators: false },
      ).lean();

      if (!user) {
        throw new NotFoundError("The User with the given ID was not found.");
      }

      console.log("User updated in DB. Radius:", user.radius);

      // Sync Dustbin radius
      if (data.radius !== undefined) {
        const result = await Dustbin.updateMany(
          { user: user._id },
          { radius: Number(data.radius) },
        );
        console.log(
          `Dustbin radius synced to ${data.radius} for user ${pathId}. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`,
        );
      }

      return user;
    } catch (error) {
      logger.error("method adminUpdateUser in adminService failed", error);
      throw error;
    }
  }
  async adminSendEmail(query, subject, html, isTemplate) {
    try {
      const userslist = await User.find(query).select("email").lean();
      userslist.forEach(async (user) => {
        await sendAdminEmailToUser(
          user.email,
          subject,
          Boolean(isTemplate),
          html,
        );
      });
      return true;
    } catch (error) {
      logger.error("method adminSendEmail in adminService failed", error);
      throw error;
    }
  }
  findDateIndex(createdAt, dates) {
    for (let i = 0; i < dates.length - 1; i++) {
      if (moment(createdAt).isBetween(dates[i], dates[i + 1], null, "[)")) {
        return i + 1; // Increment y value of the next date
      }
    }
    // If the date is after the last date in the array
    if (moment(createdAt).isSameOrAfter(dates[dates.length - 1])) {
      return dates.length - 1;
    }
    return -1;
  }
  async sendNotifications(userId, data, query, supportId) {
    try {
      // console.log("method sendNotifications in adminService called", data);
      const { title, description } = data;
      let supportTicketId = "";
      if (supportId) {
        const support = await Support.findOne({ _id: supportId });
        if (!support) throw new NotFoundError("Support not found");

        support.history = [
          { title, description, createdAt: Date.now() },
          ...support.history,
        ];

        supportTicketId = "Ticket#" + support.supportId;
        await support.save();
      }
      const userslist = await User.find(query).select("fcmtoken email").lean();
      const newusers = userslist.map((item) => ({
        _id: item._id.toString(),
        fcmtoken: item.fcmtoken,
        email: item.email,
      }));
      const jobdata = {
        userslist: newusers,
        title: title + " " + supportTicketId,
        description,
        userId: userId.toString(),
      };
      jobQueue.addJob({ data: jobdata });
    } catch (error) {
      logger.error("method sendNotifications in adminService failed", error);
      throw error;
    }
  }
  async getDashBoardUsersStats(type) {
    try {
      let query = {};
      if (type !== "all") {
        query.$or = [{ role: type }, { type: type }];
      } else {
        query.$or = [
          { role: { $nin: ["temp", "admin"] } },
          { type: { $nin: ["temp", "admin"] } },
        ];
      }

      const all = await User.countDocuments(query);
      const active = await User.countDocuments({
        ...query,
        status: { $nin: ["deactivated", "deleted"] },
      });
      const inactive = await User.countDocuments({
        ...query,
        status: { $in: ["deactivated"] },
      });
      const deleted = await User.countDocuments({
        ...query,
        status: { $in: ["deleted"] },
      });
      return {
        all,
        active,
        inactive,
        deleted,
      };
    } catch (error) {
      logger.error(
        "method getDashBoardUsersStats in adminService failed",
        error,
      );
      throw error;
    }
  }
  getDateRange(filter, customStart, customEnd) {
    try {
      let start = moment().startOf("day");
      let end = moment().endOf("day");
      let groupBy = "%Y-%m-%d"; // Default group by day

      switch (filter) {
        case "today":
          start = moment().startOf("day");
          groupBy = "%H:00"; // Aaj ke liye Ghanto (Hours) ka graph
          break;
        case "yesterday":
          start = moment().subtract(1, "days").startOf("day");
          end = moment().subtract(1, "days").endOf("day");
          groupBy = "%H:00";
          break;
        case "lastWeek":
          start = moment().subtract(7, "days").startOf("day");
          break;
        case "monthly":
          start = moment().subtract(1, "month").startOf("day");
          break;
        case "yearly":
          start = moment().subtract(1, "year").startOf("day");
          groupBy = "%Y-%m"; // Mahino (Months) ka graph
          break;
        case "custom":
          start = moment(customStart).startOf("day");
          end = moment(customEnd).endOf("day");
          break;
        case "all":
          start = moment("2020-01-01"); // Base date
          break;
      }
      return { start, end, groupBy };
    } catch (error) {
      logger.error("method getDateRange in adminService failed", error);
      throw error;
    }
  }
  async getDashBoardUsersGraphData({ startDate, endDate }) {
    try {
      // 1. Get ranges and grouping format
      const { start, end, groupBy } = this.getDateRange(
        "custom",
        startDate,
        endDate,
      );

      // 2. Build Match Query
      // 1. Match Query (Sirf Date filter rahay ga)
      const matchQuery = {
        createdAt: { $gte: start.toDate(), $lte: end.toDate() },
      };

      // 2. Aggregation Pipeline
      const stats = await User.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              $dateToString: { format: groupBy, date: "$createdAt" },
            },
            // Yeh total count hai (excluding temp/admin agar aap chaho to group mein handle karo)
            all: {
              $sum: {
                $cond: [
                  { $not: [{ $in: ["$role", ["temp", "admin"]] }] },
                  1,
                  0,
                ],
              },
            },

            // Counting Renters specifically
            renter: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$role", "renter"] },
                      { $eq: ["$type", "renter"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            // Counting Rentees specifically
            rentee: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$role", "rentee"] },
                      { $eq: ["$type", "rentee"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } }, // Date wise sorting
        {
          $project: {
            _id: 0,
            label: "$_id",
            all: 1,
            renter: 1,
            rentee: 1,
          },
        },
      ]);

      return stats;
    } catch (error) {
      logger.error(
        "method getDashBoardUsersGraphData in adminService failed",
        error,
      );
      throw error;
    }
  }
  async getDashBoardDumpstersGraphData({ startDate, endDate }) {
    try {
      const { start, end, groupBy } = this.getDateRange(
        "custom",
        startDate,
        endDate,
      );

      // 1. Build Match Query (Sirf Date par filter karein taake saara status aye)
      const matchQuery = {
        createdAt: { $gte: start.toDate(), $lte: end.toDate() },
      };

      // 2. Aggregation Pipeline
      const stats = await Dustbin.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              $dateToString: { format: groupBy, date: "$createdAt" },
            },
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "active"] },
                      { $eq: ["$verify", true] },
                      { $eq: ["$rejected", false] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            deactive: {
              // Schema mein 'deactive' hai, 'inactive' nahi
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "deactive"] },
                      { $eq: ["$verify", true] },
                      { $eq: ["$rejected", false] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            unverified: {
              $sum: { $cond: [{ $eq: ["$verify", false] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            label: "$_id",
            total: "$total",
            active: "$active",
            deactive: "$deactive",
            unverified: "$unverified",
          },
        },
      ]);

      return stats;
    } catch (error) {
      logger.error("method getDashBoardDumpstersGraphData failed", error);
      throw error;
    }
  }
  async sendPushNotificationViaFCM(payload) {
    try {
      const { fcmToken, title, description } = payload;
      if (!fcmToken) {
        throw new Error("FCM token is required");
      }
      await sendNotification({
        fcmtoken: fcmToken,
        title,
        description,
        noti: false,
      });
      return {
        success: true,
        message: "Notification sent successfully",
      };
    } catch (error) {
      logger.error(
        "method sendPushNotificationViaFCM in adminService failed",
        error,
      );
      throw error;
    }
  }
  /**
   * Private shared helper — updates a service application status and sends
   * the appropriate approval / rejection email to the applicant.
   *
   * @param {import('mongoose').Model} Model  - The Mongoose model to update (JunkRemoval | TreeRemoval).
   * @param {string} modelName                - Human-readable label used in logs and email copy, e.g. "Junk Removal".
   * @param {string} id                       - Document _id to update.
   * @param {string} status                   - New status: "approved" | "rejected".
   * @param {string} notes                    - Admin notes / rejection reason.
   * @returns {Promise<object>}               - The updated, populated document.
   */
  async _updateServiceStatus(
    Model,
    modelName,
    id,
    data,
    {
      ownerPath = "userId",
      reasonPersistField = "notes",
      displayName = modelName,
      syncUserStatusField = null,
      notificationType = "user",
      /** When approving, set User.access_types to this value (e.g. "company"). */
      accessTypesOnApprove = null,
    } = {},
  ) {
    const { status } = data || {};

    // The admin panel may send the rejection reason as `reason` or `notes`;
    // accept either and persist on the model. Mandatory when rejecting.
    const reason = String(data?.reason ?? data?.notes ?? "").trim();
    if (status === "rejected" && !reason) {
      throw new BadRequestError("A rejection reason is required.");
    }

    const updatePayload = { ...data };
    delete updatePayload.reason;
    if (reasonPersistField !== "notes") {
      delete updatePayload.notes;
    }
    if (reason) {
      updatePayload[reasonPersistField] = reason;
    }

    const record = await Model.findByIdAndUpdate(id, updatePayload, {
      new: true,
    })
      .populate(ownerPath)
      .lean();

    if (!record) throw new NotFoundError(`${modelName} not found`);

    const owner = record[ownerPath];
    if (!owner || !owner._id) {
      throw new NotFoundError(`${modelName} applicant not found`);
    }

    const { _id: userId, name, email, fcmtoken } = owner;
    const label = displayName || modelName;
    const labelLower = label.toLowerCase();

    if (syncUserStatusField && status) {
      await User.findByIdAndUpdate(userId, { [syncUserStatusField]: status });
    }

    if (status === "approved" && accessTypesOnApprove) {
      await User.findByIdAndUpdate(userId, {
        access_types: accessTypesOnApprove,
        company: record._id,
      });
    }

    if (status === "rejected") {
      await sendNotification({
        user: userId,
        to_id: userId,
        type: notificationType,
        title: `${label} Application Rejected`,
        description: `Your ${labelLower} application was rejected. Reason: ${reason}`,
        email,
        fcmtoken,
        customEmailTemplate: true,
        html: serviceRejectedTemplate(name, reason, label),
      });
    } else if (status === "approved") {
      await sendNotification({
        user: userId,
        to_id: userId,
        type: notificationType,
        title: `${label} Application Approved`,
        description: `Your ${labelLower} application has been approved. You can continue in the app.`,
        email,
        fcmtoken,
        customEmailTemplate: true,
        html: serviceApprovedTemplate(name, label),
      });
    }

    return record;
  }

  async adminUpdateJunkRemovalStatus(id, data) {
    try {
      return await this._updateServiceStatus(
        JunkRemoval,
        "Junk Removal",
        id,
        data,
      );
    } catch (error) {
      logger.error(
        "method adminUpdateJunkRemovalStatus in adminService failed",
        error,
      );
      throw error;
    }
  }

  async adminUpdateTreeRemovalStatus(id, data) {
    try {
      return await this._updateServiceStatus(
        TreeRemoval,
        "Tree Removal",
        id,
        data,
      );
    } catch (error) {
      logger.error(
        "method adminUpdateTreeRemovalStatus in adminService failed",
        error,
      );
      throw error;
    }
  }
  /**
   * Generic hard-delete for a service-application record (Junk / Tree Removal).
   * Also clears the back-reference on the owning user so they can re-apply
   * cleanly from the app.
   *
   * @param {import('mongoose').Model} Model  - Mongoose model (JunkRemoval | TreeRemoval).
   * @param {string} modelName                - Human-readable label for errors, e.g. "Junk Removal".
   * @param {string} userRefField             - User field holding the ref ("junkRemoval" | "treeRemoval" | "company").
   * @param {string} id                       - Document _id to delete.
   * @param {{ ownerField?: string, extraUserSet?: Object, beforeDelete?: (record) => Promise<void> }} [options]
   * @returns {Promise<{_id: string, deleted: true}>}
   */
  async _deleteServiceRequest(
    Model,
    modelName,
    userRefField,
    id,
    { ownerField = "userId", extraUserSet = {}, beforeDelete } = {},
  ) {
    const record = await Model.findById(id);
    if (!record) throw new NotFoundError(`${modelName} not found`);

    if (beforeDelete) {
      await beforeDelete(record);
    }

    await Model.findByIdAndDelete(id);

    const ownerId = record[ownerField];
    // Clean up the owning user's back-reference so the app doesn't point at a
    // now-deleted record and the user can submit a fresh application.
    if (ownerId) {
      await User.updateOne(
        { _id: ownerId, [userRefField]: record._id },
        { $set: { [userRefField]: null, ...extraUserSet } },
      );
      await User.updateOne(
        { _id: ownerId, access_types: userRefField },
        { $set: { access_types: null } },
      );
    }

    return { _id: String(id), deleted: true };
  }

  async adminDeleteJunkRemoval(id) {
    try {
      return await this._deleteServiceRequest(
        JunkRemoval,
        "Junk Removal",
        "junkRemoval",
        id,
      );
    } catch (error) {
      logger.error(
        "method adminDeleteJunkRemoval in adminService failed",
        error,
      );
      throw error;
    }
  }

  async adminDeleteTreeRemoval(id) {
    try {
      return await this._deleteServiceRequest(
        TreeRemoval,
        "Tree Removal",
        "treeRemoval",
        id,
      );
    } catch (error) {
      logger.error(
        "method adminDeleteTreeRemoval in adminService failed",
        error,
      );
      throw error;
    }
  }

  async adminDeleteCompany(id) {
    try {
      return await this._deleteServiceRequest(
        Company,
        "Company",
        "company",
        id,
        {
          ownerField: "user",
          extraUserSet: { compnay_status: "pending" },
          beforeDelete: async (record) => {
            await JobSite.deleteMany({ company: record._id });
          },
        },
      );
    } catch (error) {
      logger.error("method adminDeleteCompany in adminService failed", error);
      throw error;
    }
  }

  async adminUpdateCompanyStatus(id, data) {
    try {
      return await this._updateServiceStatus(Company, "Company", id, data, {
        ownerPath: "user",
        reasonPersistField: "reason",
        displayName: "Commercial Builder",
        syncUserStatusField: "compnay_status",
        notificationType: "company",
        accessTypesOnApprove: "company",
      });
    } catch (error) {
      logger.error(
        "method adminUpdateCompanyStatus in adminService failed",
        error,
      );
      throw error;
    }
  }

  async getAllJunkRemoval(query, { page, limit }) {
    try {
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      const junkRemoval = await JunkRemoval.find(query)
        .populate("userId")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const currentPageSize = junkRemoval.length;
      const total = await JunkRemoval.countDocuments(query);
      const statsArray = await JunkRemoval.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            approved: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
          },
        },
      ]);

      const junkStats = statsArray[0] || {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      };
      const totalPages = Math.ceil(total / limit);
      return {
        junkRemoval,
        total,
        page,
        limit,
        currentPageSize,
        totalPages,
        stats: junkStats,
      };
    } catch (error) {
      logger.error("method getAllJunkRemoval in adminService failed", error);
      throw error;
    }
  }
  async getAllTreeRemoval(query, { page, limit }) {
    try {
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      const treeRemoval = await TreeRemoval.find(query)
        .populate("userId")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const currentPageSize = treeRemoval.length;
      const total = await TreeRemoval.countDocuments(query);
      const totalPages = Math.ceil(total / limit);
      const statsArray = await TreeRemoval.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            approved: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
          },
        },
      ]);

      const treeStats = statsArray[0] || {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      };

      return {
        treeRemoval,
        total,
        page,
        limit,
        currentPageSize,
        totalPages,
        stats: treeStats,
      };
    } catch (error) {
      logger.error("method getAllTreeRemoval in adminService failed", error);
      throw error;
    }
  }
  async getAdminManualReviewRequests(query, { page, limit }) {
    try {
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      const [adminManualReviewRequests, total, stats] = await Promise.all([
        AdminManualReviewRequests.find(query)
          .populate("userId")
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        AdminManualReviewRequests.countDocuments(query),
        AdminManualReviewRequests.aggregate([
          {
            $group: {
              _id: "$service_type",
              total: { $sum: 1 },
              pending: {
                $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
              },
              accepted: {
                $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] },
              },
              rejected: {
                $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
              },
              deleted: {
                $sum: { $cond: [{ $eq: ["$status", "deleted"] }, 1, 0] },
              },
              userAcceptedPending: {
                $sum: {
                  $cond: [{ $eq: ["$userAcceptedStatus", "pending"] }, 1, 0],
                },
              },
              userAcceptedAccepted: {
                $sum: {
                  $cond: [{ $eq: ["$userAcceptedStatus", "accepted"] }, 1, 0],
                },
              },
              userAcceptedRejected: {
                $sum: {
                  $cond: [{ $eq: ["$userAcceptedStatus", "rejected"] }, 1, 0],
                },
              },
              userAcceptedCancelled: {
                $sum: {
                  $cond: [{ $eq: ["$userAcceptedStatus", "cancelled"] }, 1, 0],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              service_type: "$_id",
              total: 1,
              pending: 1,
              accepted: 1,
              rejected: 1,
              deleted: 1,
              userAcceptedStatusCount: {
                pending: "$userAcceptedPending",
                accepted: "$userAcceptedAccepted",
                rejected: "$userAcceptedRejected",
                cancelled: "$userAcceptedCancelled",
              },
            },
          },
        ]),
      ]);
      const currentPageSize = adminManualReviewRequests.length;

      const totalPages = Math.ceil(total / limit);
      return {
        adminManualReviewRequests,
        total,
        page,
        limit,
        currentPageSize,
        totalPages,
        stats,
      };
    } catch (error) {
      logger.error(
        "method getAdminManualReviewRequests in adminService failed",
        error,
      );
      throw error;
    }
  }
  async getAdminManualReviewRequestById(id) {
    try {
      const request = await AdminManualReviewRequests.findById(id)
        .populate("userId")
        .populate("RealOrderNumber")
        .lean();
      if (!request) {
        throw new NotFoundError("AdminManualReviewRequest not found");
      }
      return request;
    } catch (error) {
      logger.error(
        "method getAdminManualReviewRequestById in adminService failed",
        error,
      );
      throw error;
    }
  }
  async updateAdminManualReviewRequests(id, data) {
    try {
      const payload = { ...(data || {}) };
      if (payload.status === "approved") payload.status = "accepted";
      if (payload.status === "rejected") payload.status = "cancelled";

      const updated = await AdminManualReviewRequests.findByIdAndUpdate(
        id,
        payload,
        { new: true },
      ).populate("userId");
      if (!updated) {
        throw new NotFoundError("AdminManualReviewRequest not found");
      }

      // Dispatch bidirectional notification to user
      const targetUser = updated.userId;
      const targetUserId = targetUser?._id || targetUser;

      if (targetUserId) {
        const isApproved = updated.status === "accepted";
        const isCancelled = updated.status === "cancelled";
        const statusText = isApproved
          ? "approved"
          : isCancelled
            ? "rejected"
            : "updated";

        const title = `${updated.service_type} Review Quote ${isApproved ? "Approved" : isCancelled ? "Rejected" : "Updated"}`;
        const description =
          data.notes ||
          data.reason ||
          `Your  ${updated.service_type} request status has been ${statusText}.`;

        const userDoc =
          typeof targetUser === "object" && targetUser?._id
            ? targetUser
            : await User.findById(targetUserId).select("fcmtoken email").lean();

        await sendNotification({
          user: targetUserId.toString(),
          to_id: targetUserId.toString(),
          type: "request",
          title,
          description,
          fcmtoken: userDoc?.fcmtoken || "",
          email: userDoc?.email || "",
          request: updated._id,
          isImportant: true,
          noti: true,
          metadata: {
            requestId: updated._id.toString(),
            status: updated.status,
            price: (updated.metadata?.price ?? data.price ?? "").toString(),
          },
        });

        if (io) {
          try {
            io.to(`user_${targetUserId.toString()}`).emit(
              "manual-review-updated",
              {
                success: true,
                message: `Your quote request has been ${statusText}.`,
                data: updated,
              },
            );
          } catch (emitErr) {
            logger.error("manual-review-updated emit failed", emitErr);
          }
        }
      }

      return updated;
    } catch (error) {
      logger.error(
        "method updateAdminManualReviewRequests in adminService failed",
        error,
      );
      throw error;
    }
  }
  async deleteAdminManualReviewRequests(id) {
    try {
      const updated = await AdminManualReviewRequests.findByIdAndUpdate(
        id,
        { status: "deleted" },
        { new: true },
      );
      if (!updated) {
        throw new NotFoundError("AdminManualReviewRequest not found");
      }
      return updated;
    } catch (error) {
      logger.error(
        "method deleteAdminManualReviewRequests in adminService failed",
        error,
      );
      throw error;
    }
  }

  async getUserbyService(service_type, id, page, limit, search) {
    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.max(1, parseInt(limit) || 10);
      const skip = (pageNum - 1) * limitNum;
      const trimmedId = String(id || "").trim();
      const rawType = String(service_type || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

      const isDumpster =
        rawType.includes("dumbster") || rawType.includes("dumpster");
      const isPorta =
        rawType.includes("portapotty") || rawType.includes("porta");
      const isJunk = rawType.includes("junk");
      const isTree = rawType.includes("tree");
      const needsServiceObjectId =
        isDumpster || isPorta || (!isJunk && !isTree);

      const isValidObjectId = /^[a-fA-F0-9]{24}$/.test(trimmedId);
      let objectId = null;
      if (isValidObjectId) {
        objectId = new mongoose.Types.ObjectId(trimmedId);
      }

      // Dumpster / Porta Potty filter by catalog id. Junk / Tree Removal list
      // approved providers and accept any id (including dummy values).
      if (needsServiceObjectId && !objectId) {
        throw new BadRequestError("Invalid service ID format");
      }

      let Model;
      let matchStage;

      if (isDumpster) {
        Model = Dustbin;
        matchStage = {
          dumbster: objectId,
          status: "active",
          verify: true,
        };
      } else if (isPorta) {
        Model = Dustbin;
        matchStage = {
          portaPotty: objectId,
          status: "active",
          verify: true,
        };
      } else if (isJunk) {
        Model = JunkRemoval;
        matchStage = {
          status: "approved",
        };
      } else if (isTree) {
        Model = TreeRemoval;
        matchStage = { status: "approved" };
      } else {
        Model = Dustbin;
        matchStage = {
          $or: [
            { dumbster: objectId },
            { portaPotty: objectId },
            { _id: objectId },
          ],
        };
      }

      const userLookupPipeline = [
        { $match: matchStage },
        {
          $lookup: {
            from: "users",
            localField: Model === Dustbin ? "user" : "userId",
            foreignField: "_id",
            as: "userDoc",
          },
        },
        { $unwind: "$userDoc" },
        {
          $match: {
            "userDoc.status": { $nin: ["deleted", "deactivated", "deactive"] },
          },
        },
      ];

      if (search && String(search).trim()) {
        const searchRegex = new RegExp(String(search).trim(), "i");
        userLookupPipeline.push({
          $match: {
            $or: [
              { "userDoc.name": searchRegex },
              { "userDoc.username": searchRegex },
              { "userDoc.email": searchRegex },
              { "userDoc.phone": searchRegex },
              { "userDoc.companyName": searchRegex },
              { "userDoc.company_name": searchRegex },
              { "userDoc.ownerFullName": searchRegex },
            ],
          },
        });
      }

      userLookupPipeline.push(
        {
          $project: {
            _id: 1,
            user: "$userDoc",
            dumbster: 1,
            portaPotty: 1,
            address: 1,
            location: 1,
            locationObject: 1,
            radius: 1,
            status: 1,
            type: 1,
            verify: 1,
            rejected: 1,
            quantity: 1,
            description: 1,
            availableQuantity: 1,
            order_extension_price: 1,
            createdAt: 1,
          },
        },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "count" }],
          },
        },
      );

      const aggregateResult = await Model.aggregate(userLookupPipeline);
      const facetResult = aggregateResult[0] || {};
      const users = facetResult.data || [];
      const total = facetResult.totalCount?.[0]?.count || 0;
      const totalPages = Math.ceil(total / limitNum) || 0;
      const hasNext = pageNum < totalPages;
      const hasNextPage = hasNext;

      return {
        users,
        data: users,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext,
        hasNextPage,
      };
    } catch (error) {
      logger.error("getUserbyService in adminService failed", error);
      throw error;
    }
  }
}
const AdminService = new adminService();
export default AdminService;
