import mongoose from "mongoose";
import BinService from "./service.js";
const binService = new BinService();
export const createBinController = async (req, res, next) => {
  try {
    const user = req.user._id;
    const bin = await binService.createBin(user, req.body);
    const isPortaPotty = req.body.portaPotty ? true : false;
    res.status(201).json({
      success: true,
      message: `${isPortaPotty ? "Porta Potty" : "Bin"} created successfully`,
      data: bin,
    });
  } catch (error) {
    next(error);
  }
};

export const updateBinController = async (req, res, next) => {
  try {
    const serviceTypes = [
      "dumbster",
      "junkRemoval",
      "treeRemoval",
      "portaPotty",
    ];
    const providedService = serviceTypes.find((key) => req.body[key]);
    if (providedService) {
      serviceTypes.forEach((type) => {
        if (type !== providedService) {
          req.body[type] = null;
        }
      });
    }
    const bin = await binService.updateBin(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Bin updated successfully",
      data: bin,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllBinsController = async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user._id;
    const {
      page,
      limit,
      search,
      status,
      sortBy,
      sortOrder,
      end_date,
      start_date,
      dumbster,
      lat,
      lng,
      radius,
      type,
    } = req.query;
    const bins = await binService.getAllBins({
      page,
      limit,
      search,
      status,
      sortBy,
      sortOrder,
      end_date,
      start_date,
      dumbster,
      lat,
      lng,
      radius,
      userId,
      type,
    });
    // console.log("bins", bins);
    res.status(200).json({
      success: true,
      message: "Bins fetched successfully",
      data: bins,
    });
  } catch (error) {
    next(error);
  }
};

export const checkBinController = async (req, res, next) => {
  try {
    const bin = await binService.checkBin();
    res.status(200).json({
      success: true,
      message: "Bin checked successfully",
      data: bin,
    });
  } catch (error) {
    next(error);
  }
};

export const adminSideBinController = async (req, res, next) => {
  try {
    const {
      page,
      limit,
      verify,
      rejected,
      insurance_expiry_date,
      expiry_date,
      userId,
      city,
      country,
      type,
    } = req.query;
    let query = {};
    if (verify == "true") {
      query.verify = true;
      query.rejected = false;
    }
    if (verify == "false") {
      query.verify = false;
      query.rejected = false;
    }
    if (verify == "all") {
      query.verify = { $ne: null };
      query.rejected = { $ne: null };
    }
    if (verify == "pending") {
      query.verify = false;
      query.rejected = false;
    }
    if (rejected == "true") {
      query.rejected = true;
      query.verify = false;
    }
    if (city) {
      query["locationObject.city"] = city;
    }
    if (type === "portaPotty") {
      query.portaPotty = { $ne: null };
    } else if (type === "dumbster") {
      query.dumbster = { $ne: null };
      query.portaPotty = { $eq: null, $exists: false };
    } else {
      query.dumbster = { $ne: null };
      query.$or = [{ portaPotty: null }, { portaPotty: { $exists: false } }];
    }
    if (country) {
      if (Array.isArray(country)) {
        query["locationObject.country"] = { $in: country };
      } else {
        query["locationObject.country"] = country;
      }
    }

    let sorting = { _id: -1 };

    if (insurance_expiry_date === "true") {
      sorting = { insurance_expiry_date: -1 };
    }
    if (expiry_date === "true") {
      sorting = { expiry_date: -1 };
    }

    if (userId) {
      query.user = new mongoose.Types.ObjectId(userId);
    }
    query.status = "active";
    const bin = await binService.adminSideBin({
      query,
      page,
      limit,
      sorting,
      userId,
    });
    if (country) {
      const cityCounts = await binService.cityCounts(bin.bins);
      res.status(200).json({
        success: true,
        message: "Bin checked successfully",
        data: bin,
        cityCounts,
      });
    } else {
      const countryCount = await binService.countryCounts(bin.bins);
      res.status(200).json({
        success: true,
        message: "Bin checked successfully",
        data: bin,
        countryCount,
      });
    }
  } catch (error) {
    next(error);
  }
};

export const verifyBinController = async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    const userId = req.user._id;
    const io = req.app.get("socketio");

    const bin = await binService.verifyBin(req.params.id, {
      status,
      reason,
      userId,
      io,
    });
    res.status(200).json({
      success: true,
      message: "Bin verified successfully",
      data: bin,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteBinController = async (req, res, next) => {
  try {
    const bin = await binService.deleteBin(req.params.id);
    res.status(200).json({
      success: true,
      message: "Bin deleted successfully",
      data: bin,
    });
  } catch (error) {
    next(error);
  }
};

export const createBinAdminSideController = async (req, res, next) => {
  try {
    const bin = await binService.createBinAdminSide(req.params.id, req.body);
    res.status(201).json({
      success: true,
      message: "Bin created successfully",
      data: bin,
    });
  } catch (error) {
    next(error);
  }
};
