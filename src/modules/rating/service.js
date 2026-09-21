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
  async getUserRatings(userId, page = 1, limit = 10) {
    let query = {};
    query.to_id = userId;

    try {
      const user = await User.findById(userId);
      if (!user) throw new NotFoundError("User does not exist for that ID.");

      const avg_rating = user.rating;
      const totalLength = user.total_reviews;

      const rating = await Rating.find(query)
        .sort({ _id: -1 })
        .populate([
          "user",
          {
            path: "order",
            populate: {
              path: "dumbster",
            },
          },
        ])
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      const rating1 = await Rating.countDocuments({ to_id: userId, rating: 1 });
      const rating2 = await Rating.countDocuments({ to_id: userId, rating: 2 });
      const rating3 = await Rating.countDocuments({ to_id: userId, rating: 3 });
      const rating4 = await Rating.countDocuments({ to_id: userId, rating: 4 });
      const rating5 = await Rating.countDocuments({ to_id: userId, rating: 5 });
      if (rating.length > 0) {
        return {
          success: true,
          ratings: rating,
          totalLength: totalLength,
          totalsRating: {
            1: rating1,
            2: rating2,
            3: rating3,
            4: rating4,
            5: rating5,
          },
          avg_rating,
          pagination: {
            page,
            limit,
            totalPages: Math.ceil(totalLength / limit),
          },
        };
      } else {
        return {
          success: false,
          message: "No more ratings found",
          ratings: [],
          totalLength: totalLength,
          totalsRating: {
            1: rating1,
            2: rating2,
            3: rating3,
            4: rating4,
            5: rating5,
          },
          avg_rating,
        };
      }
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
  async getALLRatings(page = 1, limit = 10) {
    const rating = await Rating.find()
      .sort({ createdAt: -1 })
      .populate([
        {
          path: "user",
          select: ["name", "phone", "profilePicture", "email", "operatorStats"],
        },
        {
          path: "to_id",
          select: ["name", "phone", "profilePicture", "email", "operatorStats"],
        },
        // {
        //   path: "order",
        //   populate: {
        //     path: "dumbster",
        //   },
        //   populate: {
        //     path: "portaPotty",
        //   },
        //   select: [
        //     "dumbster",
        //     "portaPotty",
        //     "service_type",
        //     "category",
        //     "address",
        //     "subCategory",
        //     "image",
        //   ],
        // },
      ])
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();
    const totalLength = await Rating.countDocuments();
    return {
      success: true,
      ratings: rating,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalLength / limit),
      },
    };
  }
}

export default new RatingService();
