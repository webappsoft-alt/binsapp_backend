import {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
} from "../../utils/apiError.js";
import Order from "../../models/Order.js";
import Rating from "../../models/Rating.js";
import User from "../../models/User.js";
import { sendNotification } from "../../utils/notifications.js";
import OrderTimeline from "../../models/OrderTimeline.js";
import { ratingEmailTemplate } from "../../utils/emailTemplate.js";
import { recomputeOperatorGrowth } from "../../utils/growthEngine.js";
import logger from "../../config/logger.js";

class RatingService {
  async calculateAverage(initialValue, numberToAdd) {
    if (initialValue == 0) return Number(numberToAdd);

    const sum = Number(initialValue) + Number(numberToAdd);
    const average = sum / 2; // Divide by 2 since there are two values

    return Number(Math.min(average, 5)); // Cap the average at 5 using Math.min
  }
  async createRating(userId, data) {
    try {
      const { order, to_id, review, rating, type } = data;
      const ratings = new Rating({
        user: userId,
        order,
        to_id,
        review,
        rating,
        type,
      });
      const user = await User.findById(to_id);
      const loginuser = await User.findById(userId);

      if (!user) throw new NotFoundError("User does not exist for that ID.");

      user.rating =
        (await this.calculateAverage(user?.rating || 0, rating)) || 0;

      user.total_reviews = (user?.total_reviews || 0) + 1;

      const findorder = await Order.findById(order);

      if (!findorder)
        throw new NotFoundError("Order does not exist for that ID.");

      const link = `https://api.binsapp.ai/rating?orderId=${order}`;
      // `to_id` is the recipient across the app (notification list filters by
      // it and the socket badge emits to `user_${to_id}`). The recipient here is
      // the person being rated (`to_id` from the request); the actor is the
      // rater (`userId`). Keep fcmtoken/email on the recipient.
      await sendNotification({
        user: userId,
        to_id: to_id,
        description:
          "You have received a " +
          rating +
          "-star rating from " +
          (loginuser?.name || "a user"),
        type: "rating",
        title: "New Rating",
        fcmtoken: user.fcmtoken,
        order: order.toString(),
        email: user?.email || "",
        customEmailTemplate: true,
        html: ratingEmailTemplate(link, rating, loginuser?.name),
      });

      if (type == "rentee") {
        findorder.rentee_rating = ratings._id;
        await Order.findByIdAndUpdate(
          order,
          { renteeRate: true },
          { new: true },
        );
      } else {
        findorder.renter_rating = ratings._id;
      }

      await Promise.all([
        findorder.save(),
        user.save(),
        ratings.save(),
        OrderTimeline.create({
          order: order,
          orderDeatil: {
            findorder,
            ratings,
          },
          message: "Order has been rated by " + loginuser?.name,
        }),
      ]);

      // Growth quality gate uses operator rating — refresh when renter is rated
      const growthOperatorId =
        type === "renter"
          ? to_id
          : findorder?.to_id?._id || findorder?.to_id || null;
      if (growthOperatorId) {
        recomputeOperatorGrowth(growthOperatorId, {
          notify: true,
          reason: "rating_created",
        }).catch((err) =>
          logger.error("Failed to recompute growth after rating", err),
        );
      }

      return ratings;
    } catch (error) {
      throw error;
    }
  }
  async getUserRatings(userId, pageOrOptions = 1, maybeLimit = 10) {
    try {
      let page = 1;
      let limit = 10;
      let sortBy = "newest";
      let ratingFilter = null;
      let serviceFilter = null;
      let searchQuery = null;

      if (typeof pageOrOptions === "object" && pageOrOptions !== null) {
        page = pageOrOptions.page || 1;
        limit = pageOrOptions.limit || 50;
        sortBy = pageOrOptions.sortBy || pageOrOptions.sort || "newest";
        ratingFilter = pageOrOptions.rating;
        serviceFilter = pageOrOptions.service;
        searchQuery = pageOrOptions.search;
      } else {
        page = pageOrOptions;
        limit = maybeLimit;
      }

      const user = await User.findById(userId);
      if (!user) throw new NotFoundError("User does not exist for that ID.");

      // Find all orders belonging to this provider to ensure all order reviews are included
      const providerOrders = await Order.find({ to_id: userId })
        .select("_id")
        .lean();
      const orderIds = providerOrders.map((o) => o._id);

      const baseQuery = {
        $or: [
          { to_id: userId },
          { order: { $in: orderIds } },
        ],
      };

      const totalLength = await Rating.countDocuments(baseQuery);
      const rating1 = await Rating.countDocuments({ ...baseQuery, rating: 1 });
      const rating2 = await Rating.countDocuments({ ...baseQuery, rating: 2 });
      const rating3 = await Rating.countDocuments({ ...baseQuery, rating: 3 });
      const rating4 = await Rating.countDocuments({ ...baseQuery, rating: 4 });
      const rating5 = await Rating.countDocuments({ ...baseQuery, rating: 5 });

      const allRatings = await Rating.find(baseQuery).select("rating").lean();
      const sumRating = allRatings.reduce((sum, r) => sum + (Number(r?.rating) || 0), 0);
      const avg_rating = allRatings.length > 0
        ? Number((sumRating / allRatings.length).toFixed(1))
        : Number(user.rating || 0);

      const parsedLimit = Number(limit) > 0 ? Number(limit) : 10;
      const parsedPage = Number(page) > 0 ? Number(page) : 1;

      // Filtered query for list
      const filteredQuery = { ...baseQuery };
      if (ratingFilter && ratingFilter !== "all") {
        filteredQuery.rating = Number(ratingFilter);
      }
      if (searchQuery && String(searchQuery).trim()) {
        filteredQuery.review = { $regex: String(searchQuery).trim(), $options: "i" };
      }

      // Sort criteria
      let sortObj = { createdAt: -1, _id: -1 };
      if (sortBy === "oldest") {
        sortObj = { createdAt: 1, _id: 1 };
      } else if (sortBy === "highest") {
        sortObj = { rating: -1, createdAt: -1 };
      } else if (sortBy === "lowest") {
        sortObj = { rating: 1, createdAt: 1 };
      }

      const rating = await Rating.find(filteredQuery)
        .sort(sortObj)
        .populate([
          {
            path: "user",
            select: "name email phone profilePicture",
          },
          {
            path: "to_id",
            select: "name email phone profilePicture",
          },
          {
            path: "order",
            populate: [
              { path: "dumbster" },
              { path: "junkRemoval" },
              { path: "treeRemoval" },
              { path: "portaPotty" },
            ],
          },
        ])
        .limit(parsedLimit)
        .skip((parsedPage - 1) * parsedLimit)
        .lean();

      return {
        success: true,
        ratings: rating,
        totalLength: totalLength,
        filteredCount: await Rating.countDocuments(filteredQuery),
        totalsRating: {
          1: rating1,
          2: rating2,
          3: rating3,
          4: rating4,
          5: rating5,
        },
        avg_rating,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          totalPages: Math.ceil(totalLength / parsedLimit) || 1,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteRating(ratingId, currentUser) {
    try {
      const rating = await Rating.findById(ratingId);
      if (!rating) {
        throw new NotFoundError("Rating not found.");
      }

      const currentUserId =
        currentUser?._id?.toString() || currentUser?.id?.toString();
      const isTargetUser =
        rating.to_id && rating.to_id.toString() === currentUserId;
      const isAuthor =
        rating.user && rating.user.toString() === currentUserId;
      const isAdmin =
        currentUser?.role === "admin" || currentUser?.userType === "admin";

      let isOrderOwner = false;
      if (rating.order) {
        const orderDoc = await Order.findById(rating.order)
          .select("to_id")
          .lean();
        if (
          orderDoc &&
          orderDoc.to_id &&
          orderDoc.to_id.toString() === currentUserId
        ) {
          isOrderOwner = true;
        }
      }

      if (!isTargetUser && !isAuthor && !isAdmin && !isOrderOwner) {
        throw new ForbiddenError(
          "You are not authorized to delete this review."
        );
      }

      // Clear references in Order
      if (rating.order) {
        const orderUpdate = {};
        if (rating.type === "rentee") {
          orderUpdate.rentee_rating = null;
          orderUpdate.renteeRate = false;
        } else {
          orderUpdate.renter_rating = null;
        }
        await Order.findByIdAndUpdate(rating.order, { $unset: orderUpdate });
      }

      // Recalculate average rating and total_reviews on target user
      if (rating.to_id) {
        const remainingRatings = await Rating.find({
          to_id: rating.to_id,
          _id: { $ne: rating._id },
        })
          .select("rating")
          .lean();

        const targetUser = await User.findById(rating.to_id);
        if (targetUser) {
          targetUser.total_reviews = remainingRatings.length;
          if (remainingRatings.length === 0) {
            targetUser.rating = 0;
          } else {
            const sum = remainingRatings.reduce(
              (acc, r) => acc + (Number(r.rating) || 0),
              0
            );
            targetUser.rating = Number(
              (sum / remainingRatings.length).toFixed(1)
            );
          }
          await targetUser.save();
        }

        recomputeOperatorGrowth(rating.to_id, {
          notify: false,
          reason: "rating_deleted",
        }).catch((err) =>
          logger.error("Failed to recompute growth after rating delete", err)
        );
      }

      await Rating.findByIdAndDelete(ratingId);

      return {
        id: ratingId,
        deleted: true,
      };
    } catch (error) {
      throw error;
    }
  }
  async getOrderRating(orderId) {
    try {
      // Both parties can rate each other for the same order, so return every
      // rating for it (not just one). We also expose role-labeled fields so the
      // app can render each side without guessing who rated whom.
      const [order, ratings] = await Promise.all([
        Order.findById(orderId).select("user to_id").lean(),
        Rating.find({ order: orderId })
          .sort({ createdAt: 1 })
          .populate([
            "user",
            "to_id",
            {
              path: "order",
              populate: {
                path: "dumbster",
              },
            },
          ])
          .lean(),
      ]);

      const ratedBy = (rating) => rating?.user?._id?.toString() || "";

      const customerId = order?.user?.toString();
      const ownerId = order?.to_id?.toString();

      // "customer" review = given BY the customer (order.user) about the owner.
      // "owner" review = given BY the owner (order.to_id) about the customer.
      const customerRating =
        ratings.find((r) => customerId && ratedBy(r) === customerId) || null;
      const ownerRating =
        ratings.find((r) => ownerId && ratedBy(r) === ownerId) || null;

      // Also key by the rating `type` to match Order.renter_rating/rentee_rating.
      const renteeRating = ratings.find((r) => r.type === "rentee") || null;
      const renterRating = ratings.find((r) => r.type === "renter") || null;

      return {
        ratings,
        customerRating,
        ownerRating,
        renteeRating,
        renterRating,
      };
    } catch (error) {
      throw error;
    }
  }
  async getALLRatings(page = 1, limit = 10, filters = {}) {
    const { search, rating, type } = filters || {};
    let query = {};
    if (rating && rating !== "all") {
      query.rating = Number(rating);
    }
    if (type && type !== "all") {
      query.type = type;
    }
    if (search && String(search).trim()) {
      query.$or = [
        { review: { $regex: String(search).trim(), $options: "i" } },
      ];
    }

    const [ratingList, totalLength, allRatings] = await Promise.all([
      Rating.find(query)
        .sort({ createdAt: -1 })
        .populate([
          {
            path: "user",
            select: ["name", "comp_name", "phone", "profilePicture", "email", "operatorStats"],
          },
          {
            path: "to_id",
            select: ["name", "comp_name", "phone", "profilePicture", "email", "operatorStats"],
          },
          {
            path: "order",
            select: [
              "orderNumber",
              "service_type",
              "category",
              "address",
              "price",
              "amount",
              "status",
              "city",
              "state",
            ],
          },
        ])
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean(),
      Rating.countDocuments(query),
      Rating.find().select("rating type").lean(),
    ]);

    const totalCount = allRatings.length;
    const avgRating =
      totalCount > 0
        ? (
            allRatings.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) /
            totalCount
          ).toFixed(1)
        : "5.0";

    const breakdown = {
      5: allRatings.filter((r) => r.rating === 5).length,
      4: allRatings.filter((r) => r.rating === 4).length,
      3: allRatings.filter((r) => r.rating === 3).length,
      2: allRatings.filter((r) => r.rating === 2).length,
      1: allRatings.filter((r) => r.rating === 1).length,
    };

    return {
      success: true,
      ratings: ratingList,
      stats: {
        total: totalCount,
        average: Number(avgRating),
        breakdown,
        customerReviews: allRatings.filter((r) => r.type === "rentee").length,
        providerReviews: allRatings.filter((r) => r.type === "renter").length,
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalLength / Number(limit)) || 1,
        total: totalLength,
      },
    };
  }
}

export default new RatingService();
