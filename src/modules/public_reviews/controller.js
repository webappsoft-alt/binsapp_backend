import service from "./service.js";

export const createPublicReview = async (req, res, next) => {
  try {
    const publicReview = await service.createPublicReview(req.body);
    return res.status(201).json({ success: true, data: publicReview });
  } catch (error) {
    next(error);
  }
};

export const getAllPublicReviewsbyAdmin = async (req, res, next) => {
  try {
    const { page, limit, isDeleted, search } = req.query;
    let queryObject = { isDeleted: false };
    if (isDeleted) {
      queryObject.isDeleted = isDeleted;
    }
    if (search) {
      queryObject.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { review: { $regex: search, $options: "i" } },
      ];
    }
    const publicReviews = await service.getAllPublicReviews(
      page,
      limit,
      queryObject,
    );
    return res.status(200).json({ success: true, data: publicReviews });
  } catch (error) {
    next(error);
  }
};

export const deletePublicReview = async (req, res, next) => {
  try {
    const publicReview = await service.deletePublicReview(req.params.id);
    return res.status(200).json({ success: true, data: publicReview });
  } catch (error) {
    next(error);
  }
};

export const getAllPublicReviewsForWebsite = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const publicReviews = await service.getAllPublicReviews(page, limit, {
      isDeleted: false,
    });
    return res.status(200).json({ success: true, data: publicReviews });
  } catch (error) {
    next(error);
  }
};
