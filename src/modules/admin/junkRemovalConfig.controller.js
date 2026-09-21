import JunkRemovalAdminConfiguration from "../../models/JunkRemovalAdminConfiguration.js";
import { NotFoundError } from "../../utils/apiError.js";

/**
 * GET /api/admin/junk-removal-config
 * Returns the single (first) active JunkRemovalAdminConfiguration document.
 */
export async function getJunkRemovalConfig(req, res, next) {
  try {
    const config = await JunkRemovalAdminConfiguration.findOne().lean();
    if (!config) {
      throw new NotFoundError(
        "No JunkRemovalAdminConfiguration found. Please create one via PUT.",
      );
    }
    res.status(200).json({
      success: true,
      message: "Junk removal admin configuration fetched successfully",
      data: config,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/junk-removal-config
 * Create or update the single JunkRemovalAdminConfiguration document (upsert).
 * Sends the full config body; partial fields are merged via $set internally.
 */
export async function upsertJunkRemovalConfig(req, res, next) {
  try {
    const config = await JunkRemovalAdminConfiguration.findOneAndUpdate(
      {},
      { $set: req.body },
      { new: true, upsert: true, runValidators: true },
    );
    res.status(200).json({
      success: true,
      message: "Junk removal admin configuration updated successfully",
      data: config,
    });
  } catch (error) {
    next(error);
  }
}
