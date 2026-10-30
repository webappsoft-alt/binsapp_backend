import binsProvidersService from "./service.js";

/**
 * Controller to list public bin providers within radius (e.g. 100 miles)
 * GET /api/public/bins-providers
 */
export const getBinsProvidersController = async (req, res, next) => {
  try {
    const {
      lat,
      lng,
      radius,
      search,
      size,
      service,
      sortBy,
      page,
      limit,
    } = req.query;

    const result = await binsProvidersService.getBinsProviders({
      lat,
      lng,
      radius: radius ? Number(radius) : 100, // 100 miles default
      search,
      size,
      service,
      sortBy,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 12,
    });

    res.status(200).json({
      success: true,
      message: "Bin providers fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to get full provider profile details, inventory, completed orders, and reviews
 * GET /api/public/bins-providers/:id
 */
export const getProviderDetailsController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await binsProvidersService.getProviderById(id);

    res.status(200).json({
      success: true,
      message: "Provider profile and inventory fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
