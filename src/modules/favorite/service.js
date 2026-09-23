import Favorite from "../../models/Favorite.js";
import User from "../../models/User.js";
import { NotFoundError } from "../../utils/apiError.js";

class FavoriteService {
  async createFavorite(userId, user) {
    try {
      const favorite = await Favorite.create({ userId, user });
      return favorite;
    } catch (error) {
      throw error;
    }
  }

  async deleteFavorite(userId, user) {
    try {
      const favorite = await Favorite.deleteOne({ userId, user });
      if (!favorite) {
        throw new NotFoundError("Favorite not found");
      }
      return favorite;
    } catch (error) {
      throw error;
    }
  }

  async getFavorites(userId, page = 1, limit = 10, search) {
    try {
      const p = parseInt(page) || 1;
      const l = parseInt(limit) || 10;
      const query = { userId: userId };

      if (search) {
        const matchingUsers = await User.find({
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }).select("_id");

        const userIds = matchingUsers.map((u) => u._id);
        query.user = { $in: userIds };
      }

      const favorites = await Favorite.find(query)
        .populate("user")
        .skip((p - 1) * l)
        .limit(l);

      const total = await Favorite.countDocuments(query);
      const totalPages = Math.ceil(total / l);
      const hasNextPage = p < totalPages;
      const hasPrevPage = p > 1;

      return {
        favorites,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      };
    } catch (error) {
      throw error;
    }
  }
}

export default new FavoriteService();
