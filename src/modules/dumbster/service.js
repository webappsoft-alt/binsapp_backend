import logger from "../../config/logger.js";
import Dumbster from "../../models/Dumbster.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../utils/apiError.js";
import Dustbin from "../../models/Dustbin.js";
import JunkRemoval from "../../models/JunkRemovalAdminConfiguration.js";
import TreeRemoval from "../../models/TreeRemovalAdminConfiguration.js";
import PortaPotty from "../../models/PortaPotty.js";
import { isValidObjectId } from "../../utils/_idvalidationhelper.js";
import { findBookableSizesNearby } from "../../utils/dustbinMatching.js";
class DumbsterService {
  async createDumbster(userId, dumbsterData) {
    try {
      const dus = await Dustbin.findOne({ size: dumbsterData.size }).lean();
      if (dus) {
        throw new ConflictError("Dumbster already exists");
      }

      const dumbster = await Dumbster.create({
        ...dumbsterData,
        userId,
      });

      return dumbster;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async createPortaPotty(portaPottyData) {
    try {
      const portaPotty = await PortaPotty.create(portaPottyData);
      return portaPotty;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updateDumbster(id, dumbsterData) {
    try {
      const dumbster = await Dumbster.findByIdAndUpdate(
        id,
        { ...dumbsterData },
        { new: true, runValidators: true },
        { new: true, runValidators: true },
      );
      if (!dumbster) {
        throw new NotFoundError("Dumbster not found");
      }

      return dumbster;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updateJunkRemoval(id, junkRemovalData) {
    try {
      const junkRemoval = await JunkRemoval.findByIdAndUpdate(
        id,
        { $set: junkRemovalData },
        { new: true, runValidators: true, lean: true, upsert: true },
      );
      if (!junkRemoval) {
        throw new NotFoundError("Junk removal not found");
      }

      return junkRemoval;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updateTreeRemoval(id, treeRemovalData) {
    try {
      const treeRemoval = await TreeRemoval.findByIdAndUpdate(
        id,
        { $set: treeRemovalData },
        { new: true, runValidators: true, lean: true, upsert: true },
      );
      if (!treeRemoval) {
        throw new NotFoundError("Tree removal not found");
      }

      return treeRemoval;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updatePortaPotty(id, portaPottyData) {
    try {
      const portaPotty = await PortaPotty.findByIdAndUpdate(
        id,
        { ...portaPottyData },
        { new: true, runValidators: true },
      );
      if (!portaPotty) {
        throw new NotFoundError("Porta potty not found");
      }

      return portaPotty;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updateDumbsterStatus(id, status) {
    try {
      const dumbster = await Dumbster.findByIdAndUpdate(
        id,
        { status },
        { new: true },
        { new: true },
      );
      if (!dumbster) {
        throw new NotFoundError("Dumbster not found");
      }

      return dumbster;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updateJunkRemovalStatus(id, status) {
    try {
      const junkRemoval = await JunkRemoval.findByIdAndUpdate(
        id,
        { status },
        { new: true },
      );
      if (!junkRemoval) {
        throw new NotFoundError("Junk removal not found");
      }

      return junkRemoval;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updateTreeRemovalStatus(id, status) {
    try {
      const treeRemoval = await TreeRemoval.findByIdAndUpdate(
        id,
        { status },
        { new: true },
      );
      if (!treeRemoval) {
        throw new NotFoundError("Tree removal not found");
      }

      return treeRemoval;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async updatePortaPottyStatus(id, status) {
    try {
      const portaPotty = await PortaPotty.findByIdAndUpdate(
        id,
        { status },
        { new: true },
      );
      if (!portaPotty) {
        throw new NotFoundError("Porta potty not found");
      }

      return portaPotty;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getAllDumbster({
    page,
    limit,
    search,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  }) {
    try {
      const query = {};
      if (search) {
        query.$or = [
          { size: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
      if (status) {
        query.status = status;
      }
      if (sortBy) {
        sortBy = sortBy;
      }
      if (sortOrder) {
        if (sortOrder === "asc") {
          sortOrder = 1;
        } else if (sortOrder === "desc") {
          sortOrder = -1;
        }
      }

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      const dumbster = await Dumbster.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const currentPageSize = dumbster.length;
      const total = await Dumbster.countDocuments(query);
      const totalPages = Math.ceil(total / limit);
      return { dumbster, total, page, limit, currentPageSize, totalPages };
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getAllJunkRemoval({
    page,
    limit,
    search,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  }) {
    try {
      const query = {};
      if (search) {
        query.$or = [{ description: { $regex: search, $options: "i" } }];
      }
      if (status) {
        query.status = status;
      }
      if (sortBy) {
        sortBy = sortBy;
      }
      if (sortOrder) {
        if (sortOrder === "asc") {
          sortOrder = 1;
        } else if (sortOrder === "desc") {
          sortOrder = -1;
        }
      }

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      // console.log("query", JSON.stringify(query, null, 2));
      const junkRemoval = await JunkRemoval.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      // console.log("junkRemoval", JSON.stringify(junkRemoval, null, 2));
      const currentPageSize = junkRemoval.length;
      const total = await JunkRemoval.countDocuments(query);
      const totalPages = Math.ceil(total / limit);
      return {
        junkRemoval: junkRemoval[0],
        total,
        page,
        limit,
        currentPageSize,
        totalPages,
      };
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getAllTreeRemoval({
    page,
    limit,
    search,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  }) {
    try {
      const query = {};
      if (search) {
        query.$or = [{ description: { $regex: search, $options: "i" } }];
      }
      if (status) {
        query.status = status;
      }
      if (sortBy) {
        sortBy = sortBy;
      }
      if (sortOrder) {
        if (sortOrder === "asc") {
          sortOrder = 1;
        } else if (sortOrder === "desc") {
          sortOrder = -1;
        }
      }

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      const treeRemoval = await TreeRemoval.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const currentPageSize = treeRemoval.length;
      const total = await TreeRemoval.countDocuments(query);
      const totalPages = Math.ceil(total / limit);
      return {
        treeRemoval: treeRemoval[0],
        total,
        page,
        limit,
        currentPageSize,
        totalPages,
      };
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getAllPortaPotty({
    page,
    limit,
    search,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  }) {
    try {
      const query = {};
      if (search) {
        query.$or = [{ description: { $regex: search, $options: "i" } }];
      }
      if (status) {
        query.status = status;
      }
      if (sortBy) {
        sortBy = sortBy;
      }
      if (sortOrder) {
        if (sortOrder === "asc") {
          sortOrder = 1;
        } else if (sortOrder === "desc") {
          sortOrder = -1;
        }
      }

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      const portaPotty = await PortaPotty.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const currentPageSize = portaPotty.length;
      const total = await PortaPotty.countDocuments(query);
      const totalPages = Math.ceil(total / limit);
      return {
        portaPotty,
        total,
        page,
        limit,
        currentPageSize,
        totalPages,
      };
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getDumbsterById(id) {
    try {
      if (!isValidObjectId(id)) {
        throw new NotFoundError("Dumbster not found");
      }
      const dumbster = await Dumbster.findById(id).lean();
      if (!dumbster) {
        throw new NotFoundError("Dumbster not found");
      }

      return dumbster;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getJunkRemovalById(id) {
    try {
      if (!isValidObjectId(id)) {
        throw new NotFoundError("Junk removal not found");
      }
      const junkRemoval = await JunkRemoval.findById(id).lean();
      if (!junkRemoval) {
        throw new NotFoundError("Junk removal not found");
      }

      return junkRemoval;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getTreeRemovalById(id) {
    try {
      if (!isValidObjectId(id)) {
        throw new NotFoundError("Tree removal not found");
      }
      const treeRemoval = await TreeRemoval.findById(id).lean();
      if (!treeRemoval) {
        throw new NotFoundError("Tree removal not found");
      }

      return treeRemoval;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async getPortaPottyById(id) {
    try {
      if (!isValidObjectId(id)) {
        throw new NotFoundError("Porta potty not found");
      }
      const portaPotty = await PortaPotty.findById(id).lean();
      if (!portaPotty) {
        throw new NotFoundError("Porta potty not found");
      }

      return portaPotty;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async deleteDumbster(id) {
    try {
      const dumbster = await Dumbster.findByIdAndDelete(id);
      if (!dumbster) {
        throw new NotFoundError("Dumbster not found");
      }

      return dumbster;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  /**
   * Nearby dumpster sizes for a location.
   *
   * Uses the SAME location matching rules as the socket
   * `check-service-provider-availability` (owner `radius` coverage,
   * availableQuantity, verified/active, non-deleted owner), so a size is only
   * listed here if it can actually be booked at that location. Dates are chosen
   * on a later screen, so no booking-date filtering is applied here.
   */
  async getAvailableDumbsters({ lat, lng, sizeField }) {
    try {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new BadRequestError("Valid lat and lng are required");
      }

      const countBySize = await findBookableSizesNearby({
        sizeField,
        latitude,
        longitude,
        quantity: 1,
      });

      if (countBySize.size === 0) {
        return [];
      }

      const sizes = await Dumbster.find({
        _id: { $in: [...countBySize.keys()] },
      }).lean();

      return sizes.map((item) => ({
        ...item,
        availableBins: countBySize.get(item._id.toString()) || 0,
      }));
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  async deletePortaPotty(id) {
    try {
      const portaPotty = await PortaPotty.findByIdAndDelete(id);
      if (!portaPotty) {
        throw new NotFoundError("Porta potty not found");
      }

      return portaPotty;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
  /**
   * Nearby porta potty sizes for a location. Mirrors `getAvailableDumbsters`
   * and uses the same shared location rules for consistency (no date filter).
   */
  async getAvailablePortaPotty({ lat, lng }) {
    try {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new BadRequestError("Valid lat and lng are required");
      }

      const countBySize = await findBookableSizesNearby({
        sizeField: "portaPotty",
        latitude,
        longitude,
        quantity: 1,
      });

      if (countBySize.size === 0) {
        return [];
      }

      const sizes = await PortaPotty.find({
        _id: { $in: [...countBySize.keys()] },
      }).lean();

      return sizes.map((item) => ({
        ...item,
        availableBins: countBySize.get(item._id.toString()) || 0,
      }));
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
}

export default DumbsterService;
