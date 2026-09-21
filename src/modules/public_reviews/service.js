import PublicReviews from "../../models/PublicReviews.js";

class PublicReviewService {
  async createPublicReview(body) {
    const { name, email, rating, title, review } = body;
    const publicReview = new PublicReviews({
      name,
      email,
      rating,
      title,
      review,
    });
    return await publicReview.save();
  }

  async getAllPublicReviews(page, limit, queryObject) {
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;
    const publicReviews = await PublicReviews.find(queryObject)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);
    const totalDocuments = await PublicReviews.countDocuments(queryObject);
    const totalPages = Math.ceil(totalDocuments / limitNumber);
    return {
      publicReviews,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total: totalDocuments,
        totalPages,
      },
    };
  }

  async deletePublicReview(id) {
    const publicReview = await PublicReviews.findByIdAndUpdate(
      id,
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
      { new: true },
    );
    return publicReview;
  }
}

export default new PublicReviewService();
