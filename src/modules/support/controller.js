import Support from "../../models/Support.js";
import supportService from "./service.js";

export const createSupport = async (req, res, next) => {
  try {
    const support = await supportService.createSupport(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: "Support created successfully",
      data: support,
    });
  } catch (error) {
    next(error);
  }
};

export const getSupport = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    let query = {};
    if (req.query.search) {
      const searchQuery = req.query.search;
      query.$or = [
        { name: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search
        { supportId: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search
      ];
    }

    const support = await supportService.getSupport(query, page, limit);
    res.status(200).json({
      success: true,
      message: "Support fetched successfully",
      data: support,
    });
  } catch (error) {
    next(error);
  }
};

export const attendTheSupport = async (req, res, next) => {
  try {
    const support = await supportService.attendTheSupport(req.params.id);
    res.status(200).json({
      success: true,
      message: "Support attended successfully",
      data: support,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSupport = async (req, res, next) => {
  try {
    const support = await supportService.deleteSupport(req.params.id);
    res.status(200).json({
      success: true,
      message: "Support deleted successfully",
      data: support,
    });
  } catch (error) {
    next(error);
  }
};

// Signed-in user's own tickets (provider / customer "My Tickets") with separate status counts and pagination.
export const getMySupportTickets = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status = "all", search = "" } = req.query;

    const userConditions = [{ user: req.user._id }];
    if (req.user?.email) {
      userConditions.push({
        email: { $regex: `^${req.user.email.trim()}$`, $options: "i" },
      });
    }
    const baseUserQuery = { $or: userConditions };

    // 1. Separate status counts for tabs
    const [totalCount, openCount, resolvedCount] = await Promise.all([
      Support.countDocuments(baseUserQuery),
      Support.countDocuments({ ...baseUserQuery, attended: false }),
      Support.countDocuments({ ...baseUserQuery, attended: true }),
    ]);

    // 2. Build filtered query
    const filter = { ...baseUserQuery };
    if (status === "open") {
      filter.attended = false;
    } else if (status === "resolved") {
      filter.attended = true;
    }

    if (search && String(search).trim()) {
      const s = String(search).trim();
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { supportId: { $regex: s, $options: "i" } },
          { msg: { $regex: s, $options: "i" } },
          { name: { $regex: s, $options: "i" } },
          { email: { $regex: s, $options: "i" } },
        ],
      });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const currentFilteredTotal = await Support.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(currentFilteredTotal / limitNum));

    const tickets = await Support.find(filter)
      .sort({ _id: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .select("supportId name email msg attended history createdAt updated_at")
      .lean();

    res.status(200).json({
      success: true,
      message: "Support tickets fetched successfully",
      data: tickets,
      counts: {
        all: totalCount,
        open: openCount,
        resolved: resolvedCount,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: currentFilteredTotal,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};
