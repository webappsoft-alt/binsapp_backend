import Dustbin from "../../models/Dustbin.js";
import User from "../../models/User.js";
import logger from "../../config/logger.js";
import Support from "../../models/Support.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../utils/apiError.js";
import { sendNotification } from "../../utils/notifications.js";
import { serviceRejectedTemplate } from "../../utils/emailTemplate.js";
import redisClient from "../../config/redis.js";
import mongoose from "mongoose";
import { io } from "../../socket/socket.js";
class BinService {
  _isPortaPottyBin(bin) {
    return bin?.portaPotty != null;
  }

  _portaPottyCountFilter(userId, { verify, rejected }) {
    return {
      user: userId,
      verify,
      rejected,
      status: "active",
      portaPotty: { $ne: null },
    };
  }

  async _syncPortaPottyUserCounts(user) {
    const ownerId = user._id;
    user.PortaPottypendingCount = await Dustbin.countDocuments(
      this._portaPottyCountFilter(ownerId, {
        verify: false,
        rejected: false,
      }),
    );
    user.PortaPottyverifyCount = await Dustbin.countDocuments(
      this._portaPottyCountFilter(ownerId, {
        verify: true,
        rejected: false,
      }),
    );
    user.PortaPottyrejectCount = await Dustbin.countDocuments(
      this._portaPottyCountFilter(ownerId, {
        verify: false,
        rejected: true,
      }),
    );
    await user.save();
  }

  _buildDumpsterQuery(baseQuery) {
    const q = { ...baseQuery };
    delete q.portaPotty;
    delete q.$or;
    return {
      ...q,
      dumbster: { $ne: null },
      $or: [{ portaPotty: null }, { portaPotty: { $exists: false } }],
    };
  }

  _buildPortaPottyQuery(baseQuery) {
    const q = { ...baseQuery };
    delete q.dumbster;
    delete q.$or;
    delete q.portaPotty;
    return { ...q, portaPotty: { $ne: null } };
  }

  async _aggregateAdminBinMetrics(
    filterQuery,
    userId,
    { scopeUserQuantityByService = false } = {},
  ) {
    const totalQuantityResult = await Dustbin.aggregate([
      { $match: filterQuery },
      { $group: { _id: null, totalQuantity: { $sum: "$quantity" } } },
    ]);

    let totalQuantity = 0;
    if (userId) {
      const userMatch = {
        user: new mongoose.Types.ObjectId(userId),
        status: "active",
      };
      if (scopeUserQuantityByService) {
        if (filterQuery.portaPotty != null) {
          userMatch.portaPotty = filterQuery.portaPotty;
        } else {
          userMatch.dumbster = { $ne: null };
          userMatch.$or = [
            { portaPotty: null },
            { portaPotty: { $exists: false } },
          ];
        }
      }
      const totalUserQuantityResult = await Dustbin.aggregate([
        { $match: userMatch },
        { $group: { _id: null, totalQuantity: { $sum: "$quantity" } } },
      ]);
      totalQuantity =
        totalUserQuantityResult.length > 0
          ? totalUserQuantityResult[0].totalQuantity
          : 0;
    }

    const total =
      totalQuantityResult.length > 0 ? totalQuantityResult[0].totalQuantity : 0;
    const totalbins = await Dustbin.countDocuments(filterQuery);

    return { total, totalbins, totalQuantity };
  }

  async _aggregateVerificationStats(filterQuery) {
    const stats = await Dustbin.aggregate([
      { $match: filterQuery },
      {
        $group: {
          _id: null,
          verify: {
            $sum: {
              $cond: [
                { $and: ["$verify", { $eq: ["$rejected", false] }] },
                1,
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$verify", false] },
                    { $eq: ["$rejected", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          reject: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$verify", false] }, "$rejected"] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    return (
      stats[0] || {
        verify: 0,
        pending: 0,
        reject: 0,
      }
    );
  }

  async _verifyDumpsterReject(id, { reason, userId }) {
    const dustbin = await Dustbin.findByIdAndUpdate(
      id,
      { rejected: true, verify: false },
      { new: true },
    ).populate(["user", "dumbster", "portaPotty"]);

    const user = await User.findById(dustbin.user._id);

    user.pendingCount = await Dustbin.countDocuments({
      user: dustbin.user._id,
      verify: false,
      rejected: false,
      status: "active",
    });
    user.verifyCount = await Dustbin.countDocuments({
      user: dustbin.user._id,
      verify: true,
      rejected: false,
      status: "active",
    });
    user.rejectCount = await Dustbin.countDocuments({
      user: dustbin.user._id,
      verify: false,
      rejected: true,
      status: "active",
    });

    await user.save();

    const dumpsterReason =
      String(reason || "").trim() ||
      "Your submission did not meet our verification requirements.";
    await sendNotification({
      user: userId,
      to_id: dustbin.user._id,
      description: `Your dumpster listing was rejected. Reason: ${dumpsterReason}`,
      type: "dustbin",
      title: "Dumpster Listing Rejected",
      fcmtoken: dustbin.user.fcmtoken,
      dustbin: id,
      email: dustbin.user?.email || "",
      customEmailTemplate: true,
      html: serviceRejectedTemplate(
        dustbin.user?.name || "there",
        dumpsterReason,
        "Dumpster Listing",
      ),
    });
    const updatedDustbin = await Dustbin.findById(id).populate([
      "user",
      "dumbster",
      "portaPotty",
    ]);
    return updatedDustbin;
  }

  async _verifyPortaPottyReject(id, { reason, userId }) {
    const dustbin = await Dustbin.findByIdAndUpdate(
      id,
      { rejected: true, verify: false },
      { new: true },
    ).populate(["user", "dumbster", "portaPotty"]);

    const user = await User.findById(dustbin.user._id);
    await this._syncPortaPottyUserCounts(user);

    const portaPottyReason =
      String(reason || "").trim() ||
      "Your submission did not meet our verification requirements.";
    await sendNotification({
      user: userId,
      to_id: dustbin.user._id,
      description: `Your porta potty listing was rejected. Reason: ${portaPottyReason}`,
      type: "dustbin",
      title: "Porta Potty Listing Rejected",
      fcmtoken: dustbin.user.fcmtoken,
      dustbin: id,
      email: dustbin.user?.email || "",
      customEmailTemplate: true,
      html: serviceRejectedTemplate(
        dustbin.user?.name || "there",
        portaPottyReason,
        "Porta Potty Listing",
      ),
    });

    const updatedDustbin = await Dustbin.findById(id).populate([
      "user",
      "dumbster",
      "portaPotty",
    ]);
    return updatedDustbin;
  }

  async _verifyDumpsterApprove(id, { userId }) {
    const dustbin = await Dustbin.findByIdAndUpdate(
      id,
      {
        verify: true,
        rejected: false,
      },
      { new: true },
    ).populate(["user", "dumbster", "portaPotty"]);

    const user = await User.findById(dustbin.user._id);

    user.pendingCount = await Dustbin.countDocuments({
      user: dustbin.user._id,
      verify: false,
      rejected: false,
      status: "active",
    });
    user.verifyCount = await Dustbin.countDocuments({
      user: dustbin.user._id,
      verify: true,
      rejected: false,
      status: "active",
    });
    user.rejectCount = await Dustbin.countDocuments({
      user: dustbin.user._id,
      verify: false,
      rejected: true,
      status: "active",
    });

    await user.save();

    await sendNotification({
      user: userId,
      to_id: dustbin.user._id,
      description: "Your dumpster have been verified successfully!",
      type: "dustbin",
      title: "Dumpster Verification Complete",
      fcmtoken: dustbin.user.fcmtoken,
      dustbin: id,
      email: dustbin.user?.email || "",
    });

    const previousData = await this.getUserBadgeData(
      dustbin.user._id.toString(),
    );
    const updateData = { bin: Number(previousData?.bin) || 0 + 1 };
    await this.updateBadgeCount(dustbin.user._id.toString(), updateData);
    const userData = await this.getUserBadgeData(dustbin.user._id.toString());
    io.to(dustbin.user._id.toString()).emit("bin-approve", userData);
    const udpatedbin = await Dustbin.findById(id).populate("user");
    return udpatedbin;
  }

  async _verifyPortaPottyApprove(id, { userId }) {
    const dustbin = await Dustbin.findByIdAndUpdate(
      id,
      {
        verify: true,
        rejected: false,
      },
      { new: true },
    ).populate(["user", "dumbster", "portaPotty"]);

    const user = await User.findById(dustbin.user._id);
    await this._syncPortaPottyUserCounts(user);

    await sendNotification({
      user: userId,
      to_id: dustbin.user._id,
      description: "Your porta potty listing has been verified successfully!",
      type: "dustbin",
      title: "Porta Potty Verification Complete",
      fcmtoken: dustbin.user.fcmtoken,
      dustbin: id,
      email: dustbin.user?.email || "",
    });

    io.to(dustbin.user._id.toString()).emit("porta-potty-approve", {
      PortaPottypendingCount: user.PortaPottypendingCount,
      PortaPottyverifyCount: user.PortaPottyverifyCount,
      PortaPottyrejectCount: user.PortaPottyrejectCount,
    });

    const updatedBin = await Dustbin.findById(id).populate([
      "user",
      "dumbster",
      "portaPotty",
    ]);
    return updatedBin;
  }

  async createBin(userId, binData) {
    try {
      const bin = await Dustbin.create({
        ...binData,
        user: userId,
      });

      const user = await User.findById(userId);
      if (user && binData.insurancefile && !user.insuranceFile) {
        user.insuranceFile = String(binData.insurancefile);
        user.isInsured = true;
      }
      if (binData.portaPotty) {
        user.PortaPottypendingCount = user.PortaPottypendingCount + 1;
      } else {
        user.pendingCount = user.pendingCount + 1;
      }
      await user.save();
      const isPortaPotty = binData.portaPotty ? true : false;
      const adminUser = await User.findOne({ role: "admin" }).lean();
      if (adminUser) {
        await sendNotification({
          to_id: adminUser._id,
          user: user._id,
          type: "dustbin",
          relatedEntities: {
            bin: bin._id,
          },
          action: {
            type: "create",
            target: bin._id,
            label: "Create",
          },
          priority: 1,
          title: `New ${isPortaPotty ? "Porta Potty" : "Bin"} Request`,
          description: `${user.name} has created a new ${isPortaPotty ? "porta potty" : "bin"}`,
        });
        io.to(adminUser._id.toString()).emit("admin-noti", {
          bin,
          user,
        });
      }
      return bin;
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
  async updateBin(id, binData) {
    try {
      const bin = await Dustbin.findByIdAndUpdate(id, binData, { new: true });
      if (!bin) {
        throw new NotFoundError("Bin not found");
      }
      return bin;
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
  async getAllBins({
    page,
    limit,
    search,
    status = "active",
    sortBy,
    sortOrder,
    end_date,
    start_date,
    dumbster,
    lat,
    lng,
    radius,
    userId,
    type,
  }) {
    try {
      // console.log("type", type);
      const query = {};
      if (userId) {
        query.user = userId;
      }
      if (search) {
        query.$or = [
          { size: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
      if (status) {
        query.status = status || "active";
      }
      if (end_date && start_date) {
        query.bookings = {
          $not: {
            $elemMatch: {
              $or: [
                {
                  startDate: { $lte: new Date(end_date) },
                  endDate: { $gte: new Date(start_date) },
                },
              ],
            },
          },
        };
      }
      if (dumbster) {
        query.dumbster = dumbster;
      }
      if (type === "portaPotty") {
        query.portaPotty = { $ne: null };
      } else if (type === "dumbster") {
        query.dumbster = { $ne: null };
        query.$or = [
          { portaPotty: { $eq: null } },
          { portaPotty: { $exists: false } },
        ];
      } else {
        query.dumbster = { $ne: null };
        query.$or = [
          { portaPotty: { $eq: null } },
          { portaPotty: { $exists: false } },
        ];
      }
      if (lat && lng) {
        radius = radius || 200000;
        query.location = {
          $geoWithin: {
            $centerSphere: [[lng, lat], radius / 6371000],
          },
        };
      }
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      sortBy = sortBy || "createdAt";
      sortOrder = sortOrder || "desc";
      // console.log("query", query);
      const bins = await Dustbin.find(query)
        .populate(["user", "dumbster", "portaPotty"])
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const currentPageSize = bins.length;
      const total = await Dustbin.countDocuments(query);
      const totalPages = Math.ceil(total / limit);
      return { bins, total, page, limit, currentPageSize, totalPages };
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
  async checkBin() {
    try {
      const totalPendingSupports = await Support.countDocuments({
        attended: false,
      });

      const verificationGroup = {
        $group: {
          _id: null,
          verify: {
            $sum: {
              $cond: [
                { $and: ["$verify", { $eq: ["$rejected", false] }] },
                1,
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$verify", false] },
                    { $eq: ["$rejected", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          reject: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$verify", false] }, "$rejected"] },
                1,
                0,
              ],
            },
          },
        },
      };

      const basePipeline = (serviceMatch) => [
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "u",
          },
        },
        { $unwind: "$u" },
        {
          $match: {
            "u.status": { $ne: "deleted" },
            status: "active",
            ...serviceMatch,
          },
        },
        verificationGroup,
      ];

      const [dustbinStats, portaPottyStats] = await Promise.all([
        Dustbin.aggregate(
          basePipeline({
            $or: [
              { portaPotty: null },
              { portaPotty: { $exists: false } },
            ],
          }),
        ),
        Dustbin.aggregate(
          basePipeline({
            portaPotty: { $ne: null },
          }),
        ),
      ]);

      const { verify, pending, reject } = dustbinStats[0] || {
        verify: 0,
        pending: 0,
        reject: 0,
      };
      const {
        verify: portaPottyVerify,
        pending: portaPottyPending,
        reject: portaPottyReject,
      } = portaPottyStats[0] || {
        verify: 0,
        pending: 0,
        reject: 0,
      };

      return {
        verify,
        pending,
        reject,
        totalPendingSupports,
        portaPottyVerify,
        portaPottyPending,
        portaPottyReject,
      };
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
  async adminSideBin({ query, page, limit, sorting, userId }) {
    try {
      // console.log("query", JSON.stringify(query, null, 2));
      const bins = await Dustbin.find(query)
        .populate(["user", "dumbster", "portaPotty"])
        .sort(sorting)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const currentPageSize = bins.length;

      // Top-level metrics: exact same aggregation as before (incoming query + legacy user quantity)
      const primary = await this._aggregateAdminBinMetrics(query, userId, {
        scopeUserQuantityByService: false,
      });
      const totalPages = Math.ceil(primary.totalbins / limit);

      const dumpsterQuery = this._buildDumpsterQuery(query);
      const portaPottyQuery = this._buildPortaPottyQuery(query);

      const [
        dumpsterMetrics,
        portaPottyMetrics,
        dumpsterStates,
        portaPottyStates,
      ] = await Promise.all([
        this._aggregateAdminBinMetrics(dumpsterQuery, userId, {
          scopeUserQuantityByService: true,
        }),
        this._aggregateAdminBinMetrics(portaPottyQuery, userId, {
          scopeUserQuantityByService: true,
        }),
        this._aggregateVerificationStats(dumpsterQuery),
        this._aggregateVerificationStats(portaPottyQuery),
      ]);

      return {
        bins,
        total: primary.total,
        page,
        limit,
        currentPageSize,
        totalPages,
        totalQuantity: primary.totalQuantity,
        totalbins: primary.totalbins,
        dumpsters: {
          ...dumpsterMetrics,
          ...dumpsterStates,
        },
        portaPotties: {
          ...portaPottyMetrics,
          ...portaPottyStates,
        },
      };
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
  async createBinAdminSide(userId, binData) {
    try {
      const bin = await Dustbin.create({
        ...binData,
        verify: true,
        rejected: false,
        user: userId,
      });

      const user = await User.findById(userId);

      user.verifyCount = user.verifyCount + 1;
      await user.save();
      return bin;
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
  async verifyBin(id, { status, reason, userId }) {
    try {
      const existingBin = await Dustbin.findById(id);
      if (!existingBin) {
        throw new NotFoundError("Bin not found");
      }

      const isPortaPotty = this._isPortaPottyBin(existingBin);

      if (status == "reject") {
        if (isPortaPotty) {
          return this._verifyPortaPottyReject(id, { reason, userId });
        }
        return this._verifyDumpsterReject(id, { reason, userId });
      }

      if (isPortaPotty) {
        return this._verifyPortaPottyApprove(id, { userId });
      }
      return this._verifyDumpsterApprove(id, { userId });
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }
  async getUserBadgeData(userId) {
    try {
      const userKey = `user:${userId}`; // Define Redis key

      // Use promise-based Redis method for cleaner handling
      let userData = await redisClient.get(userKey);

      // If no data exists, initialize with default values
      if (!userData || Object.keys(userData).length === 0) {
        console.log(
          "No data found for user, initializing with default values.",
        );
        return {
          bin: 0,
        };
      }

      userData = Object.fromEntries(
        Object.entries(userData).map(([key, value]) => [key, parseInt(value)]),
      );

      // Return existing user data
      return userData;
    } catch (err) {
      console.error("Error fetching user data:", err);
      return { bin: [] };
    }
  }
  async updateBadgeCount(userId, updateData) {
    try {
      const userKey = `user:${userId}`; // Redis key pattern

      // Use promise-based Redis method for cleaner handling
      let userData = await redisClient.get(userKey);
      if (userData) {
        userData = JSON.parse(userData);
      }

      // If no data exists, initialize with default values
      if (!userData || Object.keys(userData).length === 0) {
        userData = {
          bin: 0,
        };
      }

      for (const [key, value] of Object.entries(updateData)) {
        userData[key] = value; // Replace existing values with new ones
      }

      await redisClient.set(userKey, JSON.stringify(userData));
    } catch (error) {
      console.error("Error updating badge count:", error);
    }
  }
  async deleteBin(id) {
    try {
      const dustbin = await Dustbin.findByIdAndUpdate(
        id,
        {
          status: "deactive",
          updatedAt: Date.now(),
        },
        { new: true },
      );
      if (!dustbin) {
        throw new NotFoundError("Bin not found");
      }
      const user = await User.findById(dustbin.user);

      if (this._isPortaPottyBin(dustbin)) {
        // Porta potty listings track their own counters. The bin is now
        // "deactive", so recomputing from the DB (which filters on
        // status:"active") yields the correct verified/pending/rejected totals
        // and avoids corrupting the dumpster counters.
        await this._syncPortaPottyUserCounts(user);
      } else {
        if (dustbin.verify == true) {
          user.verifyCount = user.verifyCount - 1;
        } else if (dustbin.verify == false && dustbin.rejected == true) {
          user.rejectCount = user.rejectCount - 1;
        } else {
          user.pendingCount = user.pendingCount - 1;
        }
        await user.save();
      }

      const updatedDustbin = await Dustbin.findById(id).populate("user");
      return updatedDustbin;
    } catch (error) {
      console.log(error);
      logger.error(error);
      throw error;
    }
  }

  async countryCounts(bins) {
    const countryCountMap = new Map();

    // Count bins by country
    bins.forEach((bin) => {
      const country = bin.locationObject?.country;

      // Only count if country exists and is not empty
      if (country && country.trim() !== "") {
        const currentCount = countryCountMap.get(country) || 0;
        countryCountMap.set(country, currentCount + bin.quantity);
      }
    });

    // Convert to object for easier use/sending in response
    const countryCounts = Object.fromEntries(countryCountMap);
    return countryCounts;
  }
  async cityCounts(bins) {
    const cityCountMap = new Map();

    // Count bins by country
    bins.forEach((bin) => {
      const city = bin.locationObject?.city;

      // Only count if country exists and is not empty
      if (city && city.trim() !== "") {
        const currentCount = cityCountMap.get(city) || 0;
        cityCountMap.set(city, currentCount + bin.quantity);
      }
    });

    // Convert to object for easier use/sending in response
    const cityCounts = Object.fromEntries(cityCountMap);
    return cityCounts;
  }
}

export default BinService;
