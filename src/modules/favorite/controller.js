import favoriteService from "./service.js";

export const createFavorite = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { user } = req.body;
    const favorite = await favoriteService.createFavorite(userId, user);
    res.status(201).json({
      success: true,
      message: "Favorite created successfully",
      data: favorite,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteFavorite = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { user } = req.body;
    const favorite = await favoriteService.deleteFavorite(userId, user);
    res.status(200).json({
      success: true,
      message: "Favorite deleted successfully",
      data: favorite,
    });
  } catch (error) {
    next(error);
  }
};

export const getFavorites = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit, search } = req.query;
    const favorites = await favoriteService.getFavorites(
      userId,
      page,
      limit,
      search,
    );
    res.status(200).json({
      success: true,
      message: "Favorites fetched successfully",
      data: favorites,
    });
  } catch (error) {
    next(error);
  }
};
