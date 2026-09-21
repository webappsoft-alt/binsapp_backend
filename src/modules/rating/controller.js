import ratingService from "./service.js";

export const createRating = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const data = req.body;
    const rating = await ratingService.createRating(userId, data);
    res.status(200).json({
      success: true,
      message: "Rating created successfully",
      data: rating,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserRatings = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.user._id;
    const { page = 1, limit = 10 } = req.query;
    const ratings = await ratingService.getUserRatings(userId, page, limit);
    res.status(200).json({
      success: true,
      message: "Ratings fetched successfully",
      data: ratings,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminRatings = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const { page = 1, limit = 10 } = req.query;
    const ratings = await ratingService.getUserRatings(userId, page, limit);
    res.status(200).json({
      success: true,
      message: "Ratings fetched successfully",
      data: ratings,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderRating = async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const rating = await ratingService.getOrderRating(orderId);
    res.status(200).json({
      success: true,
      message: "Rating fetched successfully",
      data: rating,
    });
  } catch (error) {
    next(error);
  }
};

export const getALLRatings = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const ratings = await ratingService.getALLRatings(page, limit);
    res.status(200).json({
      success: true,
      message: "Ratings fetched successfully",
      data: ratings,
    });
  } catch (error) {
    next(error);
  }
};
