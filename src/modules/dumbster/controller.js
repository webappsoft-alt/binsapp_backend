import service from "./service.js";

const DumbsterService = new service();

export const createDumbsterController = async (req, res, next) => {
  try {
    const { userId } = req.user;

    const dumbster = await DumbsterService.createDumbster(userId, req.body);

    res.status(201).json({
      success: true,
      message: "Dumbster created successfully",
      data: dumbster,
    });
  } catch (error) {
    next(error);
  }
};
export const createPortaPottyController = async (req, res, next) => {
  try {
    const portaPotty = await DumbsterService.createPortaPotty(req.body);
    res.status(201).json({
      success: true,
      message: "Porta potty created successfully",
      data: portaPotty,
    });
  } catch (error) {
    next(error);
  }
};
export const updateDumbsterController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dumbster = await DumbsterService.updateDumbster(id, req.body);
    res.status(200).json({
      success: true,
      message: "Dumbster updated successfully",
      data: dumbster,
    });
  } catch (error) {
    next(error);
  }
};
export const updateJunkRemovalController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const junkRemoval = await DumbsterService.updateJunkRemoval(id, req.body);
    res.status(200).json({
      success: true,
      message: "Junk removal updated successfully",
      data: junkRemoval,
    });
  } catch (error) {
    next(error);
  }
};
export const updateTreeRemovalController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const treeRemoval = await DumbsterService.updateTreeRemoval(id, req.body);
    res.status(200).json({
      success: true,
      message: "Tree removal updated successfully",
      data: treeRemoval,
    });
  } catch (error) {
    next(error);
  }
};
export const updatePortaPottyController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const portaPotty = await DumbsterService.updatePortaPotty(id, req.body);
    res.status(200).json({
      success: true,
      message: "Porta potty updated successfully",
      data: portaPotty,
    });
  } catch (error) {
    next(error);
  }
};
export const updateDumbsterStatusController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const dumbster = await DumbsterService.updateDumbsterStatus(id, status);
    res.status(200).json({
      success: true,
      message: "Dumbster status updated successfully",
      data: dumbster,
    });
  } catch (error) {
    next(error);
  }
};
export const updateJunkRemovalStatusController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const junkRemoval = await DumbsterService.updateJunkRemovalStatus(
      id,
      status,
    );
    res.status(200).json({
      success: true,
      message: "Junk removal status updated successfully",
      data: junkRemoval,
    });
  } catch (error) {
    next(error);
  }
};
export const updateTreeRemovalStatusController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const treeRemoval = await DumbsterService.updateTreeRemovalStatus(
      id,
      status,
    );
    res.status(200).json({
      success: true,
      message: "Tree removal status updated successfully",
      data: treeRemoval,
    });
  } catch (error) {
    next(error);
  }
};
export const updatePortaPottyStatusController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const portaPotty = await DumbsterService.updatePortaPottyStatus(id, status);
    res.status(200).json({
      success: true,
      message: "Porta potty status updated successfully",
      data: portaPotty,
    });
  } catch (error) {
    next(error);
  }
};
export const getAllDumbsterController = async (req, res, next) => {
  try {
    const { page, limit, search, status, sortBy, sortOrder } = req.query;
    const dumbster = await DumbsterService.getAllDumbster({
      page,
      limit,
      search,
      status,
      sortBy,
      sortOrder,
    });
    res.status(200).json({
      success: true,
      message: "Dumbster fetched successfully",
      data: dumbster,
    });
  } catch (error) {
    next(error);
  }
};
export const getAllJunkRemovalController = async (req, res, next) => {
  try {
    const { page, limit, search, status, sortBy, sortOrder } = req.query;
    const junkRemoval = await DumbsterService.getAllJunkRemoval({
      page,
      limit,
      search,
      status,
      sortBy,
      sortOrder,
    });
    res.status(200).json({
      success: true,
      message: "Junk removal fetched successfully",
      data: junkRemoval,
    });
  } catch (error) {
    next(error);
  }
};
export const getAllTreeRemovalController = async (req, res, next) => {
  try {
    const { page, limit, search, status, sortBy, sortOrder } = req.query;
    const treeRemoval = await DumbsterService.getAllTreeRemoval({
      page,
      limit,
      search,
      status,
      sortBy,
      sortOrder,
    });
    res.status(200).json({
      success: true,
      message: "Tree removal fetched successfully",
      data: treeRemoval,
    });
  } catch (error) {
    next(error);
  }
};
export const getAllPortaPottyController = async (req, res, next) => {
  try {
    const { page, limit, search, status, sortBy, sortOrder } = req.query;
    const portaPotty = await DumbsterService.getAllPortaPotty({
      page,
      limit,
      search,
      status,
      sortBy,
      sortOrder,
    });
    res.status(200).json({
      success: true,
      message: "Porta potty fetched successfully",
      data: portaPotty,
    });
  } catch (error) {
    next(error);
  }
};
export const getDumbsterByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dumbster = await DumbsterService.getDumbsterById(id);
    res.status(200).json({
      success: true,
      message: "Dumbster fetched successfully",
      data: dumbster,
    });
  } catch (error) {
    next(error);
  }
};
export const getJunkRemovalByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const junkRemoval = await DumbsterService.getJunkRemovalById(id);
    res.status(200).json({
      success: true,
      message: "Junk removal fetched successfully",
      data: junkRemoval,
    });
  } catch (error) {
    next(error);
  }
};
export const getTreeRemovalByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const treeRemoval = await DumbsterService.getTreeRemovalById(id);
    res.status(200).json({
      success: true,
      message: "Tree removal fetched successfully",
      data: treeRemoval,
    });
  } catch (error) {
    next(error);
  }
};
export const getPortaPottyByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const portaPotty = await DumbsterService.getPortaPottyById(id);
    res.status(200).json({
      success: true,
      message: "Porta potty fetched successfully",
      data: portaPotty,
    });
  } catch (error) {
    next(error);
  }
};
export const deleteDumbsterController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dumbster = await DumbsterService.deleteDumbster(id);
    res.status(200).json({
      success: true,
      message: "Dumbster deleted successfully",
      data: dumbster,
    });
  } catch (error) {
    next(error);
  }
};

export const getNearbyDumbsterController = async (req, res, next) => {
  try {
    const {
      lat,
      lng,
      city,
      state,
      stateCode,
      zip,
      county,
      materialType,
    } = req.query;
    const dumbster = await DumbsterService.getAvailableDumbsters({
      lat,
      lng,
      city,
      state,
      stateCode,
      zip,
      county,
      materialType,
      sizeField: "dumbster",
    });
    res.status(200).json({
      success: true,
      message: "Dumbster fetched successfully",
      data: dumbster,
    });
  } catch (error) {
    next(error);
  }
};

// ── Pricing zones ────────────────────────────────────────────────────────────

export const createPricingZoneController = async (req, res, next) => {
  try {
    const zone = await DumbsterService.createPricingZone(req.body);
    res.status(201).json({
      success: true,
      message: "Pricing zone created successfully",
      data: zone,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePricingZoneController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const zone = await DumbsterService.updatePricingZone(id, req.body);
    res.status(200).json({
      success: true,
      message: "Pricing zone updated successfully",
      data: zone,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllPricingZonesController = async (req, res, next) => {
  try {
    const data = await DumbsterService.getAllPricingZones(req.query);
    res.status(200).json({
      success: true,
      message: "Pricing zones fetched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPricingZoneByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const zone = await DumbsterService.getPricingZoneById(id);
    res.status(200).json({
      success: true,
      message: "Pricing zone fetched successfully",
      data: zone,
    });
  } catch (error) {
    next(error);
  }
};

export const deletePricingZoneController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const zone = await DumbsterService.deletePricingZone(id);
    res.status(200).json({
      success: true,
      message: "Pricing zone deleted successfully",
      data: zone,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePricingZoneStatusController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const zone = await DumbsterService.updatePricingZoneStatus(id, status);
    res.status(200).json({
      success: true,
      message: "Pricing zone status updated successfully",
      data: zone,
    });
  } catch (error) {
    next(error);
  }
};
export const deletePortaPottyController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const portaPotty = await DumbsterService.deletePortaPotty(id);
    res.status(200).json({
      success: true,
      message: "Porta potty deleted successfully",
      data: portaPotty,
    });
  } catch (error) {
    next(error);
  }
};
// export const getNearbyDumbsterController = async (req, res, next) => {
//   try {
//     const { lat, lng } = req.query;
//     const dumbster = await DumbsterService.getAvailableDumbsters({ lat, lng });
//     res.status(200).json({
//       success: true,
//       message: "Dumbster fetched successfully",
//       data: dumbster,
//     });
//   } catch (error) {
//     next(error);
//   }
// };
export const getNearbyPortaPottyController = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    const portaPotty = await DumbsterService.getAvailablePortaPotty({
      lat,
      lng,
    });
    res.status(200).json({
      success: true,
      message: "Porta potty fetched successfully",
      data: portaPotty,
    });
  } catch (error) {
    next(error);
  }
};
