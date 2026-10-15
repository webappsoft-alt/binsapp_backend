import User from "../../models/User.js";
import Dustbin from "../../models/Dustbin.js";
import {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
} from "../../utils/apiError.js";
import Order from "../../models/Order.js";
import { io, connectedUsers } from "../../socket/socket.js";
import Tier from "../../models/Tier.js";
import JunkRemoval from "../../models/JunkRemoval.js";
import TreeRemoval from "../../models/TreeRemoval.js";
import Company from "../../models/Company.js";
import { sendNotification } from "../../utils/notifications.js";
import { servicePendingReviewTemplate } from "../../utils/emailTemplate.js";
import logger from "../../config/logger.js";

const generateRandomString = (length = 10) => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export async function userinfo(userId) {
  let user = await User.findById(userId)
    .populate(["junkRemoval", "treeRemoval", "company"])
    .select("-password")
    .lean();
  if (!user) throw new BadRequestError("User not found");

  // Initialize operatorStats for operators that don't have them yet so the
  // response always carries a consistent shape.
  if (!user.operatorStats) {
    user = await User.findByIdAndUpdate(
      userId,
      {
        operatorStats: {
          tier: 1,
          score: 0,
          totalJobs: 0,
          acceptedJobs: 0,
          cancelledJobs: 0,
          onTimeDeliveries: 0,
          avgRating: 0,
          lastActive: Date.now(),
          acceptanceRate: 0,
          cancellationRate: 0,
          onTimeRate: 0,
          completionRate: 0,
          responseRate: 0,
          avgResponseTime: 0,
          totalRevenue: 0,
        },
      },
      { new: true },
    )
      .select("-password")
      .lean();
  }

  // nextTier is always the tier one level above the operator's current tier
  // (null only when they're already at the top tier).
  const currentTier = user.operatorStats?.tier ?? 1;
  const nextTier = await Tier.findOne({ level: currentTier + 1 }).lean();
  return { ...user, nextTier: nextTier || null };
}

/**
 * @function updatePassword
 * @description Securely updates the user's password after verifying the old one
 * @param {string} email - User email (must be verified via middleware)
 * @param {string} oldPassword - Current password to verify identity
 * @param {string} newPassword - New password to be stored
 * @returns {Object} Success message
 * @throws {NotFoundError} If user not found
 * @throws {UnauthorizedError} If old password is incorrect
 * @throws {BadRequestError} If new password is same as old one
 */
export async function updatePassword(email, oldPassword, newPassword) {
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new NotFoundError("User not found");

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw new UnauthorizedError("Old password is incorrect");

  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame)
    throw new BadRequestError(
      "New password cannot be the same as old password",
    );

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  return { message: "Password updated successfully" };
}

/**
 * Build a sanitized payload for a nested service application (Junk / Tree /
 * Company) and decide its `status` safely.
 *
 * Rules:
 * - The backend owns `status`; a client-sent `status` is ignored.
 * - New application            -> "pending".
 * - Existing + explicit reapply -> "pending".
 * - Existing + previously rejected/missing status -> "pending" (re-application).
 * - Otherwise (approved / pending) -> status is left untouched, so applying or
 *   editing a *different* service (or partial fields) never un-approves this one.
 *
 * @param {Object} incoming     - Raw service payload from the request body.
 * @param {Object|null} currentDoc - The currently linked service doc (populated), if any.
 * @param {string} ownerField   - Owner ref field on the service doc ("userId" | "user").
 * @param {import('mongoose').Types.ObjectId} ownerId - The user's _id.
 * @returns {Object} Payload safe to $set / create.
 */
function buildServiceApplicationPayload(
  incoming,
  currentDoc,
  ownerField,
  ownerId,
) {
  // Strip client-controlled `status` and the `reapply` control flag so neither
  // is blindly persisted.
  const { status: _clientStatus, reapply, ...fields } = incoming || {};
  const payload = { ...fields, [ownerField]: ownerId };

  const currentStatus = currentDoc?.status;
  const isReapplication =
    reapply === true || !currentStatus || currentStatus === "rejected";

  if (!currentDoc || isReapplication) {
    payload.status = "pending";
  }
  // When updating an existing approved/pending doc without a reapply, we
  // intentionally omit `status` so the existing value is preserved.

  return payload;
}

/**
 * Dynamically update user fields
 * Only allows updates if user exists and status is 'active'
 *
 * @param {string} userId - The ID of the user to update
 * @param {Object} updates - Key-value pairs of fields to update
 * @returns {Object} Updated user object
 * @throws {NotFoundError} if user not found
 * @throws {ForbiddenError} if user status is not 'active'
 * @throws {BadRequestError} if update object is empty
 */
export async function updateUser(userId, updates = {}) {
  if (!userId) throw new BadRequestError("User ID is required");

  const user = await User.findById(userId).populate([
    "junkRemoval",
    "treeRemoval",
    "company",
  ]);
  if (!user) throw new NotFoundError("User not found");
  if (updates.email) {
    const checkEmail = await User.countDocuments({
      email: updates.email?.toLowerCase(),
      type: updates.type,
      _id: { $ne: userId },
    });
    if (checkEmail > 0) throw new BadRequestError("Email already exists");
    user.email = updates.email;
  }

  const appliedServices = [];

  // 2. Handle Junk Removal Nested Update
  if (updates.junkRemoval && typeof updates.junkRemoval === "object") {
    let junkData;
    const junkPayload = buildServiceApplicationPayload(
      updates.junkRemoval,
      user.junkRemoval,
      "userId",
      user._id,
    );
    if (user.junkRemoval) {
      // Existing update — status preserved unless re-applying (see helper).
      junkData = await JunkRemoval.findByIdAndUpdate(
        user.junkRemoval._id,
        { $set: junkPayload },
        { new: true, runValidators: true },
      );
    } else {
      // New create and link
      junkData = await JunkRemoval.create(junkPayload);
      user.junkRemoval = junkData._id;
    }
    // Insurance upload (COI) unlocks junk/site-cleanup accept flow.
    const coiUrl =
      junkData?.COI || junkPayload?.COI || junkPayload?.coi || null;
    if (coiUrl) {
      user.isInsured = true;
      user.insuranceFile = String(coiUrl);
    }
    appliedServices.push({
      key: "junkRemoval",
      label: "Junk Removal",
      entityId: junkData?._id,
    });
    // Remove from updates to prevent Object.assign conflict
    delete updates.junkRemoval;
  }

  // 3. Handle Tree Removal Nested Update
  if (updates.treeRemoval && typeof updates.treeRemoval === "object") {
    let treeData;
    const treePayload = buildServiceApplicationPayload(
      updates.treeRemoval,
      user.treeRemoval,
      "userId",
      user._id,
    );
    if (user.treeRemoval) {
      // Existing update — status preserved unless re-applying (see helper).
      treeData = await TreeRemoval.findByIdAndUpdate(
        user.treeRemoval._id,
        { $set: treePayload },
        { new: true, runValidators: true },
      );
    } else {
      // New create and link
      treeData = await TreeRemoval.create(treePayload);
      user.treeRemoval = treeData._id;
    }
    appliedServices.push({
      key: "treeRemoval",
      label: "Tree Removal",
      entityId: treeData?._id,
    });
    // Remove from updates
    delete updates.treeRemoval;
  }
  if (updates.company && typeof updates.company === "object") {
    let companyData;
    const companyPayload = buildServiceApplicationPayload(
      updates.company,
      user.company,
      "user",
      user._id,
    );
    if (user.company) {
      // Existing update — status preserved unless re-applying (see helper).
      companyData = await Company.findByIdAndUpdate(
        user.company._id,
        { $set: companyPayload },
        { new: true, runValidators: true },
      );
    } else {
      // New create and link
      companyData = await Company.create(companyPayload);
      user.company = companyData._id;
    }
    appliedServices.push({
      key: "company",
      label: "Company",
      entityId: companyData?._id,
    });
    // Remove from updates
    delete updates.company;
  }
  // Top-level insurance upload (no junkRemoval profile required).
  const incomingInsurance =
    updates.insuranceFile ||
    updates.insurancefile ||
    updates.insurance ||
    updates.coi;
  if (incomingInsurance != null && String(incomingInsurance).trim()) {
    const fileUrl = String(incomingInsurance).trim();
    user.insuranceFile = fileUrl;
    user.isInsured = true;
    // Keep linked junk profile COI in sync when present.
    if (user.junkRemoval?._id) {
      try {
        await JunkRemoval.findByIdAndUpdate(user.junkRemoval._id, {
          $set: { COI: fileUrl },
        });
      } catch (err) {
        logger.error("Failed to sync junkRemoval.COI from insuranceFile", err);
      }
    }
    delete updates.insuranceFile;
    delete updates.insurancefile;
    delete updates.insurance;
    delete updates.coi;
    delete updates.isInsured;
  } else if (updates.isInsured === true || updates.isInsured === "true") {
    user.isInsured = true;
    delete updates.isInsured;
  } else if (updates.isInsured === false || updates.isInsured === "false") {
    user.isInsured = false;
    delete updates.isInsured;
  }

  // if (user.status !== "active") {
  //   throw new ForbiddenError(
  //     `User account is ${user.status} and cannot be updated`
  //   );
  // }

  // if (Object.keys(updates).length === 0) {
  //   throw new BadRequestError("No fields provided for update");
  // }

  Object.assign(user, updates);
  if (!user.role && updates.type !== user.role) {
    user.role = updates.type;
  }
  if (updates.radius !== undefined) {
    await Dustbin.updateMany(
      { user: userId },
      { radius: Number(updates.radius) },
    );
    console.log(
      `Dustbin radius synced to ${updates.radius} for user ${userId}`,
    );
  }
  // console.log("user.company", user.company);
  await user.save();

  if (appliedServices.length > 0) {
    notifyUserOfServiceApplicationPending(user, appliedServices).catch((err) =>
      logger.error("User service-application pending notification failed", err),
    );
    notifyAdminOfServiceApplications(user, appliedServices).catch((err) =>
      logger.error("Admin service-application notification failed", err),
    );
  }

  return user;
}

async function notifyUserOfServiceApplicationPending(user, appliedServices) {
  if (!user || !appliedServices?.length) return;

  const userLabel = user.name || user.email?.split("@")[0] || "Valued Partner";
  const serviceLabels = appliedServices.map((s) => s.label).join(", ");
  const title = `${serviceLabels} Verification in Progress`;
  const description = `Your ${serviceLabels} application is currently pending admin review. You will be notified once it is approved.`;
  const html = servicePendingReviewTemplate(userLabel, serviceLabels);

  return sendNotification({
    user: user._id,
    to_id: user._id,
    type: "user",
    title,
    description,
    fcmtoken: user.fcmtoken || "",
    email: user.email || "",
    customEmailTemplate: true,
    html,
    metadata: {
      action: "service_application_pending",
      services: appliedServices.map((s) => s.key).join(","),
      userId: user._id.toString(),
    },
  });
}

async function notifyAdminOfServiceApplications(user, appliedServices) {
  const adminUser = await User.findOne({
    $or: [{ type: "admin" }, { role: "admin" }],
  })
    .select("fcmtoken")
    .lean();
  if (!adminUser) return;

  const userLabel = user.name || user.email || user._id.toString();
  const adminId = adminUser._id.toString();

  await Promise.all(
    appliedServices.map(async (service) => {
      const title = `New ${service.label} Application`;
      const description =
        service.key === "company"
          ? `User ${userLabel} has submitted a Company application.`
          : `User ${userLabel} has applied for ${service.label}.`;

      io.to(`user_${adminId}`).emit("admin-noti", {
        success: true,
        title,
        message: description,
        type: "user",
        service: service.key,
        userId: user._id,
      });

      return sendNotification({
        user: user._id,
        to_id: adminUser._id,
        type: "user",
        title,
        description,
        fcmtoken: adminUser.fcmtoken || "",
        email: "",
        metadata: {
          action: "service_application",
          service: service.key,
          entityId: service.entityId?.toString?.() || "",
          userId: user._id.toString(),
        },
      });
    }),
  );
}

export async function updateStats(userId, updates = {}) {
  if (!userId) throw new BadRequestError("User ID is required");

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  if (Object.keys(updates).length === 0) {
    throw new BadRequestError("No fields provided for update");
  }

  Object.assign(user, updates);
  await user.save();

  return user;
}

export async function deleteUser(userId) {
  const user = await User.findById(userId);

  if (!user)
    return res.status(404).send({
      success: false,
      message: "The User with the given ID was not found.",
    });

  user.email = user.email + "deleted" + generateRandomString(10);
  user.phone = user.phone + "deleted" + generateRandomString(10);
  user.status = "deleted";
  await user.save();
  await Dustbin.updateMany({ user: userId }, { status: "deactive" });
  await Dustbin.updateMany({ user: userId }, { status: "deactive" });
  return user;
}

export async function updateLatLongs(userId, currentlat, currentlng) {
  try {
    // Create an object to store the fields to be updated
    const updateFields = Object.fromEntries(
      Object.entries({
        currentlat,
        currentlng,
      }).filter(([key, value]) => value !== undefined),
    );

    // Check if there are any fields to update
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).send({
        success: false,
        message: "No valid fields provided for update.",
      });
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    Object.assign(user, updateFields);
    await user.save();

    if (!user)
      return res.status(400).send({
        success: false,
        message: "The User with the given ID was not found.",
      });

    const orders = await Order.find({ to_id: userId, status: "accepted" })
      .select("user onway")
      .lean();
    for (const order of orders) {
      const userSocketId = connectedUsers.get(order.user.toString());
      if (userSocketId) {
        io.to(userSocketId).emit("location-update", {
          // `order` kept for backward-compat; `orderId`/`userId` match the app's
          // preferred shape. `userId` is the driver (order owner) being tracked.
          order: order._id,
          orderId: order._id,
          userId: userId,
          currentlat,
          currentlng,
          onway: order.onway === true,
        });
      }
    }
  } catch (error) { }
}
