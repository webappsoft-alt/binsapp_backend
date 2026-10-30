import Order from "../../models/Order.js";
import User from "../../models/User.js";
import logger from "../../config/logger.js";
import moment from "moment";

/**
 * Get comprehensive Admin Reports & Executive Intelligence Data
 * Aggregates:
 * 1. Summary KPIs (Gross Revenue, Platform Cut, Completed Orders, Active Fleet, AOV, Completion Rate)
 * 2. Visual Charts (Revenue & Orders Timeline Trend, Service Distribution, Status Funnel)
 * 3. Paginated, Searchable Transaction Reports with Populated Customer, Provider, and Equipment Details
 */
export async function getAdminReports(req, res) {
  try {
    const timeRange = (req.query.timeRange || "30d").toLowerCase();
    const serviceType = req.query.serviceType || "all";
    const status = req.query.status || "all";
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query.limit, 10) || 15)
    );
    const skip = (page - 1) * limit;

    let startDate = req.query.startDate;
    let endDate = req.query.endDate;

    if (!startDate && !endDate) {
      if (timeRange === "today") {
        startDate = moment().startOf("day").toDate();
        endDate = moment().endOf("day").toDate();
      } else if (timeRange === "yesterday") {
        startDate = moment().subtract(1, "days").startOf("day").toDate();
        endDate = moment().subtract(1, "days").endOf("day").toDate();
      } else if (timeRange === "7d") {
        startDate = moment().subtract(7, "days").startOf("day").toDate();
        endDate = moment().endOf("day").toDate();
      } else if (timeRange === "30d") {
        startDate = moment().subtract(30, "days").startOf("day").toDate();
        endDate = moment().endOf("day").toDate();
      } else if (timeRange === "90d") {
        startDate = moment().subtract(90, "days").startOf("day").toDate();
        endDate = moment().endOf("day").toDate();
      } else if (timeRange === "ytd") {
        startDate = moment().startOf("year").toDate();
        endDate = moment().endOf("day").toDate();
      } else if (timeRange === "all") {
        startDate = null;
        endDate = null;
      }
    } else {
      startDate = startDate ? moment(startDate).startOf("day").toDate() : null;
      endDate = endDate
        ? moment(endDate).endOf("day").toDate()
        : moment().endOf("day").toDate();
    }

    const andConditions = [];

    if (startDate && endDate) {
      andConditions.push({ createdAt: { $gte: startDate, $lte: endDate } });
    } else if (startDate) {
      andConditions.push({ createdAt: { $gte: startDate } });
    } else if (endDate) {
      andConditions.push({ createdAt: { $lte: endDate } });
    }

    if (serviceType && serviceType !== "all") {
      andConditions.push({
        service_type: new RegExp(`^${serviceType.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i"),
      });
    }

    if (status && status !== "all") {
      andConditions.push({ status: status.toLowerCase() });
    }

    if (search) {
      const regex = new RegExp(
        search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"),
        "i"
      );
      const matchingUsers = await User.find({
        $or: [
          { name: regex },
          { comp_name: regex },
          { email: regex },
          { phone: regex },
        ],
      }).select("_id");
      const userIds = matchingUsers.map((u) => u._id);

      andConditions.push({
        $or: [
          { orderNumber: regex },
          { order_id: regex },
          { address: regex },
          { city: regex },
          { paymentId: regex },
          { user: { $in: userIds } },
          { to_id: { $in: userIds } },
        ],
      });
    }

    const filterQuery = andConditions.length > 0 ? { $and: andConditions } : {};

    // 1. Fetch aggregate records for fast KPIs and Chart metrics
    const allFilteredOrders = await Order.find(filterQuery)
      .select(
        "price amount status service_type createdAt address city user to_id driveaway cancelation transfer refunded"
      )
      .lean();

    let grossRevenue = 0;
    let platformRevenue = 0;
    let providerPayouts = 0;
    let completedCount = 0;
    let activeCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    const userSet = new Set();
    const providerSet = new Set();

    const serviceCounts = {
      Dumpster: { count: 0, revenue: 0 },
      "Junk Removal": { count: 0, revenue: 0 },
      "Porta Potty": { count: 0, revenue: 0 },
      "Tree Removal": { count: 0, revenue: 0 },
      Other: { count: 0, revenue: 0 },
    };

    allFilteredOrders.forEach((ord) => {
      const gross = Number(ord.price || ord.amount || 0);
      grossRevenue += gross;

      let addon = 0;
      if (ord.driveaway) addon += 50;
      if (ord.cancelation) addon += 39;
      const base = Math.max(0, gross - addon);
      const fee = Math.round(base * 0.15 * 100) / 100;
      const platformCut = Math.round((fee + addon) * 100) / 100;
      const providerCut = Math.round((base - fee) * 100) / 100;

      platformRevenue += platformCut;
      providerPayouts += providerCut;

      const st = String(ord.status || "").toLowerCase();
      if (st === "completed") completedCount++;
      else if (st === "cancelled") cancelledCount++;
      else if (st === "pending") pendingCount++;
      else activeCount++;

      if (ord.user) userSet.add(String(ord.user));
      if (ord.to_id) providerSet.add(String(ord.to_id));

      const sType = ord.service_type || "Dumpster";
      let key = "Other";
      if (/dumbster|dumpster/i.test(sType)) key = "Dumpster";
      else if (/junk/i.test(sType)) key = "Junk Removal";
      else if (/porta|potty/i.test(sType)) key = "Porta Potty";
      else if (/tree/i.test(sType)) key = "Tree Removal";

      serviceCounts[key].count++;
      serviceCounts[key].revenue += gross;
    });

    const totalOrders = allFilteredOrders.length;
    const avgOrderValue =
      totalOrders > 0 ? Math.round(grossRevenue / totalOrders) : 0;
    const completionRate =
      totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0;

    // 2. Timeline trend data for Charts
    const isMonthly =
      timeRange === "90d" || timeRange === "ytd" || timeRange === "all";
    const trendMap = {};

    const sorted = [...allFilteredOrders].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

    sorted.forEach((ord) => {
      const d = moment(ord.createdAt);
      const key = isMonthly ? d.format("MMM YYYY") : d.format("MMM DD");
      if (!trendMap[key]) {
        trendMap[key] = { label: key, revenue: 0, orders: 0 };
      }
      trendMap[key].revenue += Math.round(Number(ord.price || ord.amount || 0));
      trendMap[key].orders += 1;
    });

    const trend = Object.values(trendMap);

    // 3. Service Breakdown array
    const serviceBreakdown = Object.entries(serviceCounts)
      .filter(([_, data]) => data.count > 0 || totalOrders === 0)
      .map(([name, data]) => ({
        name,
        count: data.count,
        revenue: Math.round(data.revenue * 100) / 100,
        percentage:
          totalOrders > 0 ? Math.round((data.count / totalOrders) * 100) : 0,
      }));

    // 4. Status Breakdown
    const statusBreakdown = [
      {
        status: "Completed",
        count: completedCount,
        color: "#10b981",
        percentage:
          totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0,
      },
      {
        status: "Active On-Site",
        count: activeCount,
        color: "#3b82f6",
        percentage:
          totalOrders > 0 ? Math.round((activeCount / totalOrders) * 100) : 0,
      },
      {
        status: "Pending",
        count: pendingCount,
        color: "#f59e0b",
        percentage:
          totalOrders > 0 ? Math.round((pendingCount / totalOrders) * 100) : 0,
      },
      {
        status: "Cancelled",
        count: cancelledCount,
        color: "#ef4444",
        percentage:
          totalOrders > 0 ? Math.round((cancelledCount / totalOrders) * 100) : 0,
      },
    ];

    // 5. Paginated Detailed Transaction Records
    const paginatedOrders = await Order.find(filterQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "name comp_name email phone profilePicture")
      .populate("to_id", "name comp_name email phone profilePicture")
      .populate("company", "name comp_name email phone")
      .populate("dumbster", "name size price tons weight user")
      .populate("dustbin", "name size price tons weight user")
      .populate("portaPotty", "name price user")
      .populate("junkRemoval", "title price user")
      .populate("treeRemoval", "title price user")
      .lean();

    const formattedOrders = paginatedOrders.map((ord) => {
      const gross = Number(ord.price || ord.amount || 0);
      let addonFees = 0;
      if (ord.driveaway) addonFees += 50;
      if (ord.cancelation) addonFees += 39;
      const base = Math.max(0, gross - addonFees);
      const platformFee = Math.round(base * 0.15 * 100) / 100;
      const totalPlatformCut = Math.round((platformFee + addonFees) * 100) / 100;
      const netProviderIncome = Math.round((base - platformFee) * 100) / 100;

      const provider =
        ord.to_id ||
        ord.company ||
        ord.dumbster?.user ||
        ord.dustbin?.user ||
        null;

      return {
        _id: ord._id,
        orderNumber:
          ord.orderNumber ||
          ord.order_id ||
          String(ord._id).slice(-6).toUpperCase(),
        serviceType: ord.service_type || "Dumpster",
        status: ord.status || "pending",
        grossAmount: gross,
        platformFee: totalPlatformCut,
        netProviderIncome,
        paymentType: ord.payment_type || "stripe",
        paymentId: ord.paymentId || null,
        address: ord.address || "",
        city: ord.city || "",
        createdAt: ord.createdAt,
        startDate: ord.start_date || ord.deliveryDate || null,
        endDate: ord.end_date || ord.pickupDate || null,
        numDays: ord.num_days || 0,
        customer: {
          _id: ord.user?._id,
          name: ord.user?.name || "Customer",
          comp_name: ord.user?.comp_name || "",
          email: ord.user?.email || "—",
          phone: ord.user?.phone || "—",
          profilePicture: ord.user?.profilePicture,
        },
        provider: {
          _id: provider?._id || ord.to_id?._id,
          name:
            ord.to_id?.comp_name ||
            ord.to_id?.name ||
            ord.company?.name ||
            "Provider",
          comp_name: ord.to_id?.comp_name || ord.company?.name || "",
          email: ord.to_id?.email || "—",
          phone: ord.to_id?.phone || "—",
        },
        equipment: {
          name:
            ord.dumbster?.name ||
            ord.dustbin?.name ||
            ord.portaPotty?.name ||
            ord.junkRemoval?.title ||
            ord.treeRemoval?.title ||
            "Standard Container",
          size: ord.dumbster?.size || ord.dustbin?.size || "Standard",
          tons: ord.dumbster?.tons || ord.dustbin?.tons || 0,
        },
      };
    });

    return res.status(200).json({
      success: true,
      message: "Admin reports fetched successfully",
      data: {
        summary: {
          grossRevenue: Math.round(grossRevenue * 100) / 100,
          platformRevenue: Math.round(platformRevenue * 100) / 100,
          providerPayouts: Math.round(providerPayouts * 100) / 100,
          totalOrders,
          completedCount,
          activeCount,
          pendingCount,
          cancelledCount,
          avgOrderValue,
          completionRate,
          uniqueCustomers: userSet.size,
          uniqueProviders: providerSet.size,
        },
        charts: {
          trend,
          serviceBreakdown,
          statusBreakdown,
        },
        orders: formattedOrders,
        pagination: {
          total: totalOrders,
          page,
          limit,
          totalPages: Math.ceil(totalOrders / limit) || 1,
        },
      },
    });
  } catch (error) {
    logger.error("getAdminReports controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin reports",
      error: error.message,
    });
  }
}
