import * as builderOfferService from "./service.js";

export const createOffer = async (req, res, next) => {
  try {
    const data = await builderOfferService.createOffer(req.user._id, req.body);
    res.status(201).json({
      status: "success",
      message: "Builder offer created",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const listOffers = async (req, res, next) => {
  try {
    const data = await builderOfferService.listCompanyOffers(req.user._id, req.query);
    res.status(200).json({
      status: "success",
      message: "Builder offers fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getOffer = async (req, res, next) => {
  try {
    const data = await builderOfferService.getCompanyOffer(
      req.user._id,
      req.params.id,
    );
    res.status(200).json({
      status: "success",
      message: "Builder offer fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateOffer = async (req, res, next) => {
  try {
    const data = await builderOfferService.updateDraftOrAdjust(
      req.user._id,
      req.params.id,
      req.body,
    );
    res.status(200).json({
      status: "success",
      message: "Builder offer updated",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const submitOffer = async (req, res, next) => {
  try {
    const data = await builderOfferService.submitOffer(
      req.user._id,
      req.params.id,
    );
    res.status(200).json({
      status: "success",
      message: "Builder offer submitted",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const adjustOffer = async (req, res, next) => {
  try {
    const data = await builderOfferService.updateDraftOrAdjust(
      req.user._id,
      req.params.id,
      { ...req.body, rematch: true },
    );
    res.status(200).json({
      status: "success",
      message: "Builder offer adjusted",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelOffer = async (req, res, next) => {
  try {
    const data = await builderOfferService.cancelCompanyOffer(
      req.user._id,
      req.params.id,
      req.body || {},
    );
    res.status(200).json({
      status: "success",
      message: "Builder offer deleted",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const allowCounters = async (req, res, next) => {
  try {
    const data = await builderOfferService.allowCounters(
      req.user._id,
      req.params.id,
    );
    res.status(200).json({
      status: "success",
      message: "Counteroffers enabled",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const saveBlanket = async (req, res, next) => {
  try {
    const data = await builderOfferService.saveAsBlanket(
      req.user._id,
      req.params.id,
      req.body,
    );
    res.status(200).json({
      status: "success",
      message: "Blanket pricing saved",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const quickOrder = async (req, res, next) => {
  try {
    const data = await builderOfferService.quickOrderFromBlanket(
      req.user._id,
      req.body,
    );
    res.status(201).json({
      status: "success",
      message: "Quick order submitted",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getRecommendation = async (req, res, next) => {
  try {
    const data = await builderOfferService.getRecommendation(
      req.user._id,
      req.params.id,
    );
    res.status(200).json({
      status: "success",
      message: "Recommendation fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const respondCounter = async (req, res, next) => {
  try {
    const data = await builderOfferService.respondToCounter(
      req.user._id,
      req.params.id,
      req.params.counterId,
      req.body,
    );
    res.status(200).json({
      status: "success",
      message: "Counter response saved",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const listPortions = async (req, res, next) => {
  try {
    const data = await builderOfferService.listProviderPortions(req.user._id);
    res.status(200).json({
      status: "success",
      message: "Builder offer portions fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const acceptPortion = async (req, res, next) => {
  try {
    const data = await builderOfferService.acceptPortion(
      req.user._id,
      req.params.id,
      req.body,
    );
    res.status(200).json({
      status: "success",
      message: "Builder offer portion accepted",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const declinePortion = async (req, res, next) => {
  try {
    const data = await builderOfferService.declinePortion(
      req.user._id,
      req.params.id,
      req.body,
    );
    res.status(200).json({
      status: "success",
      message: "Builder offer portion declined",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const submitCounter = async (req, res, next) => {
  try {
    const data = await builderOfferService.submitCounter(
      req.user._id,
      req.params.id,
      req.body,
    );
    res.status(201).json({
      status: "success",
      message: "Counteroffer submitted",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const adminListOffers = async (req, res, next) => {
  try {
    const data = await builderOfferService.listAdminOffers(req.query);
    res.status(200).json({
      status: "success",
      message: "Builder offers fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const adminGetOffer = async (req, res, next) => {
  try {
    const data = await builderOfferService.getAdminOffer(req.params.id);
    res.status(200).json({
      status: "success",
      message: "Builder offer fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const adminPatchOffer = async (req, res, next) => {
  try {
    const data = await builderOfferService.adminPatchOffer(
      req.params.id,
      req.body,
    );
    res.status(200).json({
      status: "success",
      message: "Builder offer updated",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const adminInvite = async (req, res, next) => {
  try {
    const data = await builderOfferService.adminInviteProvider(
      req.params.id,
      req.body.providerId,
    );
    res.status(200).json({
      status: "success",
      message: "Provider invited",
      data,
    });
  } catch (error) {
    next(error);
  }
};
