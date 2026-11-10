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

// Signed-in user's own tickets (provider / customer "My Tickets").
export const getMySupportTickets = async (req, res, next) => {
  try {
    const tickets = await Support.find({ user: req.user._id })
      .sort({ _id: -1 })
      .limit(100)
      .select("supportId name email msg attended history createdAt updated_at")
      .lean();
    res.status(200).json({
      success: true,
      message: "Support tickets fetched successfully",
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};
