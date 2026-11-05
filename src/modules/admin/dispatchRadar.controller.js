import Order from "../../models/Order.js";
import AssignOrder from "../../models/AssignOrder.js";
import Dustbin from "../../models/Dustbin.js";
import User from "../../models/User.js";
import logger from "../../config/logger.js";
import moment from "moment";

/**
 * Get City-wide Live Dispatch Radar data for Admin Operations
 * Supports:
 * 1. viewMode === "table" (Table View): returns server-paginated orders with totalPages, total, page, limit
 * 2. req.query.stage provided: returns paginated orders (10 per page) for that specific pipeline board ("See More")
 * 3. viewMode === "kanban" (Board View default): returns 10 initial orders for each of the 6 stages along with exact live KPI counts
 * All modes support live search (searches orderNumber, address, city, customer, and provider).
 */
export async function getAdminLiveDispatchRadar(req, res) {
  try {
    const viewMode = (req.query.viewMode || "kanban").toLowerCase();
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const statusTab = (req.query.status || "all").toLowerCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));

    // Build common search condition if search is provided
    let searchCondition = null;
    if (search) {
      const regex = new RegExp(search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), "i");
      const matchingUsers = await User.find({
        $or: [
          { name: regex },
          { comp_name: regex },
          { email: regex },
          { phone: regex },
        ],
      }).select("_id");
      const userIds = matchingUsers.map((u) => u._id);

      searchCondition = {
        $or: [
          { orderNumber: regex },
          { order_id: regex },
          { address: regex },
          { city: regex },
          { user: { $in: userIds } },
          { to_id: { $in: userIds } },
        ],
      };
    }

    // Always fetch live KPI counts from database so counts are 100% accurate
    const [
      pendingAcceptanceCount,
      dropsScheduledCount,
      activeOnSiteCount,
      pickupsPendingCount,
      completedTodayCount,
      cancelledCount,
      activeProvidersList,
    ] = await Promise.all([
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({ status: { $in: ["driver_assigned", "out_for_delivery"] } }),
      Order.countDocuments({ status: { $in: ["in_progress", "accepted"] } }),
      Order.countDocuments({ status: "pending_pickup" }),
      Order.countDocuments({ status: "completed" }),
      Order.countDocuments({ status: "cancelled" }),
      Order.distinct("to_id", {
        status: {
          $in: [
            "accepted",
            "in_progress",
            "driver_assigned",
            "out_for_delivery",
            "pending_pickup",
          ],
        },
      }),
    ]);

    const totalActive =
      pendingAcceptanceCount +
      dropsScheduledCount +
      activeOnSiteCount +
      pickupsPendingCount;
    const radarStats = {
      totalActive,
      pendingAcceptanceCount,
      dropsScheduledCount,
      activeOnSiteCount,
      pickupsPendingCount,
      completedTodayCount,
      cancelledCount,
      activeProvidersCount: activeProvidersList.filter(Boolean).length,
    };

    const boardFields =
      "_id orderNumber order_id service category status amount total total_price price address city user to_id owner createdAt updatedAt driver size dumbster dustbin portaPotty service_type userIds start_date payment_type";

    const normalizeOrder = (order) => {
      if (order.to_id && !order.owner) {
        order.owner = order.to_id;
      }
      const rawNum =
        order.orderNumber ||
        order.order_id ||
        (order._id ? String(order._id).slice(-6).toUpperCase() : "");
      order.orderNumber = String(rawNum).replace(/^#+/, "").trim();
    };

    // Mode 1: Table View requested (server-side paginated query)
    if (viewMode === "table") {
      let statusQuery = {};
      if (statusTab === "pending" || statusTab === "unaccepted") {
        statusQuery = { status: "pending" };
      } else if (statusTab === "drops") {
        statusQuery = { status: { $in: ["driver_assigned", "out_for_delivery"] } };
      } else if (statusTab === "active") {
        statusQuery = { status: { $in: ["in_progress", "accepted"] } };
      } else if (statusTab === "pickups") {
        statusQuery = { status: "pending_pickup" };
      } else if (statusTab === "completed") {
        statusQuery = { status: "completed" };
      } else if (statusTab === "cancelled") {
        statusQuery = { status: "cancelled" };
      } else {
        // "all" boards
        statusQuery = {
          status: {
            $in: [
              "pending",
              "accepted",
              "in_progress",
              "driver_assigned",
              "out_for_delivery",
              "pending_pickup",
              "completed",
              "cancelled",
            ],
          },
        };
      }

      const andClauses = [statusQuery];
      if (searchCondition) {
        andClauses.push(searchCondition);
      }
      const finalTableQuery = andClauses.length > 1 ? { $and: andClauses } : andClauses[0];

      const tableLimit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 15));
      const [tableOrders, totalTableOrders] = await Promise.all([
        Order.find(finalTableQuery)
          .select(boardFields)
          .populate("user", "name email phone address coordinates role")
          .populate("to_id", "name email phone comp_name address coordinates role")
          .populate("dumbster", "size")
          .populate("dustbin", "size")
          .populate("portaPotty", "size")
          .sort({ updatedAt: -1 })
          .skip((page - 1) * tableLimit)
          .limit(tableLimit)
          .lean(),
        Order.countDocuments(finalTableQuery),
      ]);

      tableOrders.forEach(normalizeOrder);

      const totalPages = totalTableOrders === 0 ? 0 : Math.ceil(totalTableOrders / tableLimit);

      return res.status(200).json({
        success: true,
        data: {
          radar: radarStats,
          orders: tableOrders,
          pagination: {
            total: totalTableOrders,
            totalPages,
            page,
            limit: tableLimit,
          },
        },
      });
    }

    // Stage definition mapping
    const stageMap = {
      pendingAcceptance: { query: { status: "pending" }, sort: { createdAt: -1 }, total: pendingAcceptanceCount },
      unaccepted: { query: { status: "pending" }, sort: { createdAt: -1 }, total: pendingAcceptanceCount },
      pending: { query: { status: "pending" }, sort: { createdAt: -1 }, total: pendingAcceptanceCount },

      dropsScheduled: { query: { status: { $in: ["driver_assigned", "out_for_delivery"] } }, sort: { updatedAt: -1 }, total: dropsScheduledCount },
      drops: { query: { status: { $in: ["driver_assigned", "out_for_delivery"] } }, sort: { updatedAt: -1 }, total: dropsScheduledCount },

      activeOnSite: { query: { status: { $in: ["in_progress", "accepted"] } }, sort: { updatedAt: -1 }, total: activeOnSiteCount },
      active: { query: { status: { $in: ["in_progress", "accepted"] } }, sort: { updatedAt: -1 }, total: activeOnSiteCount },

      pickupsPending: { query: { status: "pending_pickup" }, sort: { updatedAt: -1 }, total: pickupsPendingCount },
      pickups: { query: { status: "pending_pickup" }, sort: { updatedAt: -1 }, total: pickupsPendingCount },

      completedToday: { query: { status: "completed" }, sort: { updatedAt: -1 }, total: completedTodayCount },
      completed: { query: { status: "completed" }, sort: { updatedAt: -1 }, total: completedTodayCount },

      cancelled: { query: { status: "cancelled" }, sort: { updatedAt: -1 }, total: cancelledCount },
    };

    // Mode 2: Specific stage pagination ("See More" button clicked for one board)
    const requestedStage = req.query.stage ? String(req.query.stage).trim() : null;
    if (requestedStage) {
      const stageConfig = stageMap[requestedStage] || stageMap.activeOnSite;
      const andClauses = [stageConfig.query];
      if (searchCondition) {
        andClauses.push(searchCondition);
      }
      const finalStageQuery = andClauses.length > 1 ? { $and: andClauses } : andClauses[0];

      const stageLimit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));
      const stagePage = Math.max(1, parseInt(req.query.page, 10) || 1);

      const [stageOrders, actualStageTotal] = await Promise.all([
        Order.find(finalStageQuery)
          .select(boardFields)
          .populate("user", "name email phone role")
          .populate("to_id", "name email phone comp_name role")
          .populate("dumbster", "size")
          .populate("dustbin", "size")
          .populate("portaPotty", "size")
          .sort(stageConfig.sort)
          .skip((stagePage - 1) * stageLimit)
          .limit(stageLimit)
          .lean(),
        searchCondition ? Order.countDocuments(finalStageQuery) : stageConfig.total,
      ]);

      stageOrders.forEach(normalizeOrder);

      return res.status(200).json({
        success: true,
        data: {
          stage: requestedStage,
          orders: stageOrders,
          pagination: {
            page: stagePage,
            limit: stageLimit,
            total: actualStageTotal,
            hasMore: stagePage * stageLimit < actualStageTotal,
          },
          radar: radarStats,
        },
      });
    }

    // Mode 3: Default Kanban View - Return initial 10 orders per board for fast initial payload
    const initialLimit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));

    const buildFilter = (baseQuery) => {
      return searchCondition ? { $and: [baseQuery, searchCondition] } : baseQuery;
    };

    const [
      pendingOrders,
      dropsOrders,
      activeOnSiteOrders,
      pickupsOrders,
      completedOrders,
      cancelledOrders,
    ] = await Promise.all([
      Order.find(buildFilter({ status: "pending" }))
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ createdAt: -1 })
        .limit(initialLimit)
        .lean(),
      Order.find(buildFilter({ status: { $in: ["driver_assigned", "out_for_delivery"] } }))
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ updatedAt: -1 })
        .limit(initialLimit)
        .lean(),
      Order.find(buildFilter({ status: { $in: ["in_progress", "accepted"] } }))
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ updatedAt: -1 })
        .limit(initialLimit)
        .lean(),
      Order.find(buildFilter({ status: "pending_pickup" }))
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ updatedAt: -1 })
        .limit(initialLimit)
        .lean(),
      Order.find(buildFilter({ status: "completed" }))
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ updatedAt: -1 })
        .limit(initialLimit)
        .lean(),
      Order.find(buildFilter({ status: "cancelled" }))
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ updatedAt: -1 })
        .limit(initialLimit)
        .lean(),
    ]);

    pendingOrders.forEach(normalizeOrder);
    dropsOrders.forEach(normalizeOrder);
    activeOnSiteOrders.forEach(normalizeOrder);
    pickupsOrders.forEach(normalizeOrder);
    completedOrders.forEach(normalizeOrder);
    cancelledOrders.forEach(normalizeOrder);

    const allOrdersList = [
      ...pendingOrders,
      ...dropsOrders,
      ...activeOnSiteOrders,
      ...pickupsOrders,
      ...completedOrders,
      ...cancelledOrders,
    ];

    return res.status(200).json({
      success: true,
      data: {
        radar: radarStats,
        stages: {
          pendingAcceptance: pendingOrders,
          dropsScheduled: dropsOrders,
          activeOnSite: activeOnSiteOrders,
          pickupsPending: pickupsOrders,
          completedToday: completedOrders,
          cancelled: cancelledOrders,
        },
        allActiveOrders: allOrdersList,
        stageTotals: {
          pendingAcceptance: pendingAcceptanceCount,
          dropsScheduled: dropsScheduledCount,
          activeOnSite: activeOnSiteCount,
          pickupsPending: pickupsPendingCount,
          completedToday: completedTodayCount,
          cancelled: cancelledCount,
        },
      },
    });
  } catch (error) {
    logger.error("getAdminLiveDispatchRadar error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch live dispatch radar",
    });
  }
}
