import Order from "../../models/Order.js";
import AssignOrder from "../../models/AssignOrder.js";
import Dustbin from "../../models/Dustbin.js";
import User from "../../models/User.js";
import logger from "../../config/logger.js";
import moment from "moment";

/**
 * Get City-wide Live Dispatch Radar data for Admin Operations
 * Supports both:
 * 1. viewMode === "kanban" (Board View): returns all orders categorized into pipeline stages without pagination
 * 2. viewMode === "table" (Table View): returns server-paginated orders with totalPages, total, page, limit
 * Both modes support live search (searches orderNumber, address, city, customer, and provider).
 */
export async function getAdminLiveDispatchRadar(req, res) {
  try {
    const viewMode = (req.query.viewMode || "kanban").toLowerCase();
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const statusTab = (req.query.status || "all").toLowerCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 15));

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

    // Always fetch live KPI counts
    const [
      dropsScheduledCount,
      activeOnSiteCount,
      pickupsPendingCount,
      completedTodayCount,
      cancelledCount,
      activeProvidersList,
    ] = await Promise.all([
      Order.countDocuments({
        status: { $in: ["driver_assigned", "out_for_delivery"] },
      }),
      Order.countDocuments({
        status: { $in: ["in_progress", "accepted"] },
      }),
      Order.countDocuments({
        status: "pending_pickup",
      }),
      Order.countDocuments({
        status: "completed",
      }),
      Order.countDocuments({
        status: "cancelled",
      }),
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

    const totalActive = dropsScheduledCount + activeOnSiteCount + pickupsPendingCount;
    const radarStats = {
      totalActive,
      dropsScheduledCount,
      activeOnSiteCount,
      pickupsPendingCount,
      completedTodayCount,
      cancelledCount,
      activeProvidersCount: activeProvidersList.filter(Boolean).length,
    };

    // If Table View requested, perform server-side paginated query
    if (viewMode === "table") {
      let statusQuery = {};
      if (statusTab === "drops") {
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

      const orderFields =
        "_id orderNumber order_id service category status amount total total_price price address city user to_id owner createdAt updatedAt driver size dumbster dustbin portaPotty";

      const [tableOrders, totalTableOrders] = await Promise.all([
        Order.find(finalTableQuery)
          .select(orderFields)
          .populate("user", "name email phone address coordinates role")
          .populate("to_id", "name email phone comp_name address coordinates role")
          .populate("dumbster", "size")
          .populate("dustbin", "size")
          .populate("portaPotty", "size")
          .sort({ updatedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Order.countDocuments(finalTableQuery),
      ]);

      tableOrders.forEach((order) => {
        if (order.to_id && !order.owner) {
          order.owner = order.to_id;
        }
      });

      const totalPages = totalTableOrders === 0 ? 0 : Math.ceil(totalTableOrders / limit);

      return res.status(200).json({
        success: true,
        data: {
          radar: radarStats,
          orders: tableOrders,
          pagination: {
            total: totalTableOrders,
            totalPages,
            page,
            limit,
          },
        },
      });
    }

    // Default: Board View (Kanban / Swiper boards with ALL records in stages without pagination)
    const activeBaseQuery = {
      status: {
        $in: [
          "accepted",
          "in_progress",
          "driver_assigned",
          "out_for_delivery",
          "pending_pickup",
        ],
      },
    };
    const completedBaseQuery = { status: "completed" };
    const cancelledBaseQuery = { status: "cancelled" };

    const activeFilter = searchCondition
      ? { $and: [activeBaseQuery, searchCondition] }
      : activeBaseQuery;
    const completedFilter = searchCondition
      ? { $and: [completedBaseQuery, searchCondition] }
      : completedBaseQuery;
    const cancelledFilter = searchCondition
      ? { $and: [cancelledBaseQuery, searchCondition] }
      : cancelledBaseQuery;

    const boardFields =
      "_id orderNumber order_id service category status amount total total_price price address city user to_id owner createdAt updatedAt driver size dumbster dustbin portaPotty";

    const [activeOrders, completedOrders, cancelledOrders] = await Promise.all([
      Order.find(activeFilter)
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean(),
      Order.find(completedFilter)
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ updatedAt: -1 })
        .limit(40)
        .lean(),
      Order.find(cancelledFilter)
        .select(boardFields)
        .populate("user", "name email phone role")
        .populate("to_id", "name email phone comp_name role")
        .populate("dumbster", "size")
        .populate("dustbin", "size")
        .populate("portaPotty", "size")
        .sort({ updatedAt: -1 })
        .limit(30)
        .lean(),
    ]);

    const normalizeOwner = (order) => {
      if (order.to_id && !order.owner) {
        order.owner = order.to_id;
      }
    };
    activeOrders.forEach(normalizeOwner);
    completedOrders.forEach(normalizeOwner);
    cancelledOrders.forEach(normalizeOwner);

    // Group into pipeline stages
    const dropsScheduled = [];
    const activeOnSite = [];
    const pickupsPending = [];

    activeOrders.forEach((order) => {
      const st = String(order.status || "").toLowerCase();
      if (st === "pending_pickup") {
        pickupsPending.push(order);
      } else if (st === "in_progress" || st === "accepted") {
        activeOnSite.push(order);
      } else {
        dropsScheduled.push(order);
      }
    });

    const allOrdersList = [
      ...activeOrders,
      ...completedOrders,
      ...cancelledOrders,
    ];

    return res.status(200).json({
      success: true,
      data: {
        radar: radarStats,
        stages: {
          dropsScheduled,
          activeOnSite,
          pickupsPending,
          completedToday: completedOrders,
          cancelled: cancelledOrders,
        },
        allActiveOrders: allOrdersList,
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
