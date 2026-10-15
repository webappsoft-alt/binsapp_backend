import service from "./service.js";

export async function createAssignOrder(req, res, next) {
  try {
    const result = await service.createAssignOrder(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: "Assign Order created successfully",
      url: `https://api.binsapp.ai/assign-driver?token=${result._id}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
export async function getAssignOrders(req, res, next) {
  try {
    const result = await service.getAssignOrders(req.user._id);
    res.status(200).json({
      success: true,
      message: "Assign Order fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateOnItsWay(req, res, next) {
  try {
    const orderId = req.orderId;
    const fcmtoken = req.body.fcmtoken;
    console.log("orderId", orderId);
    console.log("fcmtoken", fcmtoken);
    await service.updateFcmToken(req.user._id, fcmtoken);
    const result = await service.updateOnItsWay(orderId);
    res.status(200).json({
      success: true,
      message: "Assign Order updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateLocation(req, res, next) {
  try {
    const userId = req.user._id;
    const assignBy = req.assignBy;
    const { currentlat, currentlng } = req.body;
    const result = await service.updatelocation(
      userId,
      currentlat,
      currentlng,
      assignBy,
    );
    res.status(200).json({
      success: true,
      message: "Assign Order updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAssignOrder(req, res, next) {
  try {
    const result = await service.getAssignOrder(req.params.id);
    res.status(200).json({
      success: true,
      message: "Assign Order fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSubusers(req, res, next) {
  try {
    const result = await service.getSubusers(
      req.user._id,
      req.query.page,
      req.query.limit,
    );
    res.status(200).json({
      success: true,
      message: "Assign Order fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export const dropoffOrder = async (req, res, next) => {
  try {
    const orderId = req.orderId;
    const dropoffimage = req.body.dropoffimage;
    const assignBy = req.assignBy;
    const updatedSession = await service.dropoffOrder(
      {
        dropoffimage,
        orderId,
      },
      assignBy,
    );
    if (updatedSession.success) {
      res.status(200).json(updatedSession);
    } else {
      res.status(400).json(updatedSession);
    }
  } catch (error) {
    next(error);
  }
};

export const getAssignOrderList = async (req, res, next) => {
  try {
    const result = await service.getAssignOrderList(
      req.user._id,
      req.query.page,
      req.query.limit,
    );
    res.status(200).json({
      success: true,
      message: "Assign Order fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const completeOrderAssignUser = async (req, res, next) => {
  try {
    const orderId = req.orderId;
    const senderId = req.assignBy;
    const updatedSession = await service.completeOrderAssignUser(
      orderId,
      senderId,
    );
    res.status(200).json({
      success: true,
      message: "Order completed successfully",
      data: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

export const deliveryProof = async (req, res, next) => {
  try {
    const result = await service.deliveryProof(
      req.user._id,
      req.assignBy,
      {
        orderId: req.orderId,
        proofOfWorkDone: req.body.proofOfWorkDone,
      },
    );
    res.status(200).json({
      success: true,
      message: "Delivery proof submitted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAssignySubUser = async (req, res, next) => {
  try {
    const result = await service.getAssignySubUser(req.user._id);
    res.status(200).json({
      success: true,
      message: "Assign Order fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getOperatorDrivers = async (req, res, next) => {
  try {
    const result = await service.getOperatorDrivers(req.user._id);
    res.status(200).json({
      success: true,
      message: "Operator drivers fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const addOperatorDriver = async (req, res, next) => {
  try {
    const result = await service.addOperatorDriver(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: "Driver saved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteOperatorDriver = async (req, res, next) => {
  try {
    const result = await service.deleteOperatorDriver(
      req.user._id,
      req.params.id
    );
    res.status(200).json({
      success: true,
      message: "Driver deactivated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const sendDriverInvite = async (req, res, next) => {
  try {
    const result = await service.sendDriverInvite(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: result?.message || "Sign-in request sent successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const assignDriverToOrder = async (req, res, next) => {
  try {
    const result = await service.assignDriverToOrder(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: "Driver assigned successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const dispatchJob = async (req, res, next) => {
  try {
    const result = await service.dispatchJob(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: "Job dispatched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const changeDriver = async (req, res, next) => {
  try {
    const result = await service.changeDriver(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: "Driver reassigned successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getDriverJobDetails = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.params.orderId || req.orderId;
    const result = await service.getDriverJobDetails(driverId, orderId);
    res.status(200).json({
      success: true,
      message: "Driver job details fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const driverEnRoute = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.body.orderId || req.orderId;
    const result = await service.driverEnRoute(driverId, {
      ...req.body,
      orderId,
    });
    res.status(200).json({
      success: true,
      message: "Driver en route updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const driverArrived = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.body.orderId || req.orderId;
    const result = await service.driverArrived(driverId, {
      ...req.body,
      orderId,
    });
    res.status(200).json({
      success: true,
      message: "Driver arrival recorded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadDeliveryProof = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.body.orderId || req.orderId;
    const result = await service.uploadDeliveryProof(driverId, {
      ...req.body,
      orderId,
    });
    res.status(200).json({
      success: true,
      message: "Delivery proof uploaded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const completeDelivery = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.body.orderId || req.orderId;
    const result = await service.completeDelivery(driverId, { orderId });
    res.status(200).json({
      success: true,
      message: "Delivery completed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const reportPickupIssue = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.body.orderId || req.orderId;
    const result = await service.reportPickupIssue(driverId, {
      ...req.body,
      orderId,
    });
    res.status(200).json({
      success: true,
      message: "Pickup issue reported successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadPickupProof = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.body.orderId || req.orderId;
    const result = await service.uploadPickupProof(driverId, {
      ...req.body,
      orderId,
    });
    res.status(200).json({
      success: true,
      message: "Pickup proof uploaded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const completePickup = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.body.orderId || req.orderId;
    const result = await service.completePickup(driverId, { orderId });
    res.status(200).json({
      success: true,
      message: "Pickup completed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const completeSwap = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const orderId = req.body.orderId || req.orderId;
    const result = await service.completeSwap(driverId, {
      ...req.body,
      orderId,
    });
    res.status(200).json({
      success: true,
      message: "Dumpster swap completed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getOperatorLiveDashboard = async (req, res, next) => {
  try {
    const result = await service.getOperatorLiveDashboard(req.user._id);
    res.status(200).json({
      success: true,
      message: "Operator live dashboard fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
