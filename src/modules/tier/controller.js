import TierService from "./service.js";

export const getMyScore = async (req, res, next) => {
  try {
    const data = await TierService.getMyScore(req.user._id);
    res.status(200).json({
      success: true,
      message: "Operator score fetched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const createTier = async (req, res, next) => {
  try {
    const tier = await TierService.createTier(req.body);
    res.status(201).json({
      success: true,
      message: "Tier created successfully",
      data: tier,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllTiers = async (req, res, next) => {
  try {
    const tiers = await TierService.getAllTiers();
    res.status(200).json({
      success: true,
      message: "Tiers fetched successfully",
      data: tiers,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTier = async (req, res, next) => {
  try {
    const tier = await TierService.updateTier(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Tier updated successfully",
      data: tier,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTier = async (req, res, next) => {
  try {
    const tier = await TierService.deleteTier(req.params.id);
    res.status(200).json({
      success: true,
      message: "Tier deleted successfully",
      data: tier,
    });
  } catch (error) {
    next(error);
  }
};
