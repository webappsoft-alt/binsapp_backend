import mongoose from "mongoose";
import JunkRemoval from "../../models/JunkRemoval.js";
import TreeRemoval from "../../models/TreeRemoval.js";
import Dustbin from "../../models/Dustbin.js";
import { BadRequestError, NotFoundError } from "../../utils/apiError.js";

/**
 * GET /api/admin/service-requests/:type/:id
 * One provider application (junk / tree removal) or one bin listing (dumpster bin / porta potty)
 * with its owner, so the admin can open it as its own page and approve or reject there.
 */
const USER_FIELDS = "name email phone profilePicture role type comp_name companyName fullName ein createdAt status";

export async function getServiceRequestDetail(req, res, next) {
  try {
    const { type, id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError("Invalid id");
    let record;
    if (type === "junk") record = await JunkRemoval.findById(id).populate("userId", USER_FIELDS).lean();
    else if (type === "tree") record = await TreeRemoval.findById(id).populate("userId", USER_FIELDS).lean();
    else if (type === "bin" || type === "porta-potty") {
      record = await Dustbin.findById(id).populate("user", USER_FIELDS).populate("dumbster").populate("portaPotty").lean();
    } else throw new BadRequestError("type must be junk, tree, bin or porta-potty");
    if (!record) throw new NotFoundError("Request not found");
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}
