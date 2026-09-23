import logger from "../../config/logger.js";
import Dumbster from "../../models/Dumbster.js";
import DumpsterPricingZone from "../../models/DumpsterPricingZone.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../utils/apiError.js";
import JunkRemoval from "../../models/JunkRemovalAdminConfiguration.js";
import TreeRemoval from "../../models/TreeRemovalAdminConfiguration.js";
import PortaPotty from "../../models/PortaPotty.js";
import { isValidObjectId } from "../../utils/_idvalidationhelper.js";
import { findBookableSizesNearby } from "../../utils/dustbinMatching.js";
import {
  resolveDumpsterPricingForLocation,
  defaultIncludedTonsForSize,
} from "../../utils/dumpsterZonePricing.js";

const GLOBAL_RATE_STATE = "Global";
const GLOBAL_RATE_MARKET = "Global Rate";

const GLOBAL_RATE_SIZES = [
  { size: "10-12", sizeLabel: "10 YD" },
  { size: "14-16", sizeLabel: "15 YD" },
  { size: "18-20", sizeLabel: "20 YD" },
  { size: "30", sizeLabel: "30 YD" },
  { size: "40", sizeLabel: "40 YD" },
];

class DumbsterService {
  async createDumbster(userId, dumbsterData) {
    try {
      const existing = await Dumbster.findOne({ size: dumbsterData.size }).lean();
      if (existing) {
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
      const normalized =
        status === "inactive" ? "deactive" : status === "deactive" ? "deactive" : "active";
      const dumbster = await Dumbster.findByIdAndUpdate(
        id,
        { status: normalized },
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
   *
   * Pricing: if the location matches a configured State → Market → Zone,
   * overlay that zone's rates. Otherwise keep the dumpster catalog
   * default/fallback prices. Never rejects a dumpster solely for being
   * outside configured zones.
   */
  async getAvailableDumbsters({
    lat,
    lng,
    sizeField,
    city,
    state,
    stateCode,
    zip,
    county,
    materialType,
  }) {
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

      const withAvailability = sizes.map((item) => ({
        ...item,
        availableBins: countBySize.get(item._id.toString()) || 0,
      }));

      return resolveDumpsterPricingForLocation(withAvailability, {
        lat: latitude,
        lng: longitude,
        city,
        state,
        stateCode,
        zip,
        county,
      }, { materialType: materialType || "standard" });
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  // ── Geographic pricing zones (State → Market → Zone → Size rates) ─────────

  /** Drop legacy matchers (cities/zips/counties/aliases) from API payloads. */
  toPricingZoneResponse(doc) {
    if (!doc) return doc;
    const o = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
    delete o.matchers;
    return o;
  }

  /**
   * Ensure the single non-deletable Global Rate row exists in Market Pricing.
   * Rates seed from catalog dumpsters when available (old flow preserved).
   */
  async ensureGlobalPricingZone() {
    try {
      let existing = await DumpsterPricingZone.findOne({ isGlobal: true }).lean();
      if (existing) return this.toPricingZoneResponse(existing);

      existing = await DumpsterPricingZone.findOne({
        state: GLOBAL_RATE_STATE,
        market: GLOBAL_RATE_MARKET,
      }).lean();
      if (existing) {
        const updated = await DumpsterPricingZone.findByIdAndUpdate(
          existing._id,
          { $set: { isGlobal: true, zone: GLOBAL_RATE_MARKET } },
          { new: true },
        );
        return this.toPricingZoneResponse(updated);
      }

      const dumpsters = await Dumbster.find({ status: "active" }).lean();
      const bySize = new Map(
        dumpsters.map((d) => [String(d.size), d]),
      );

      const rates = GLOBAL_RATE_SIZES.map((preset) => {
        const d = bySize.get(preset.size);
        return {
          size: preset.size,
          sizeLabel: preset.sizeLabel,
          materialType: "standard",
          oneDayPrice: Number(d?.price) || 0,
          threeDayPrice: Number(d?.three_days_price) || 0,
          sevenDayPrice: Number(d?.seven_days_price) || 0,
          includedTons:
            Number(d?.tons) || defaultIncludedTonsForSize(preset.size) || 0,
          overagePerTon: Number(d?.overagePerTon) || 85,
          extraDay:
            Number(d?.per_dim_rate) || Number(d?.day_price_km) || 50,
          providerPayout: null,
          binsAppFee: null,
        };
      });

      const created = await DumpsterPricingZone.create({
        state: GLOBAL_RATE_STATE,
        stateCode: "",
        market: GLOBAL_RATE_MARKET,
        zone: GLOBAL_RATE_MARKET,
        description:
          "Platform-wide fallback rates when no market matches. Cannot be deleted.",
        isGlobal: true,
        status: "active",
        rates,
      });
      return this.toPricingZoneResponse(created);
    } catch (error) {
      logger.error(error);
      // Non-fatal — listing can continue without global row
      return null;
    }
  }

  /** One-shot cleanup for docs created before matchers were removed. */
  async purgeLegacyMatchers() {
    try {
      await DumpsterPricingZone.updateMany(
        { matchers: { $exists: true } },
        { $unset: { matchers: 1 } },
      );
    } catch (err) {
      logger.error(err);
    }
  }

  /** Keep geo only when center has valid [lng, lat]; otherwise omit (2dsphere-safe). */
  sanitizePricingZonePayload(data = {}) {
    const next = { ...data };

    // Market ≡ zone — one concept. Always mirror market onto zone.
    if (next.market != null && String(next.market).trim()) {
      next.market = String(next.market).trim();
      next.zone = next.market;
    } else if (next.zone != null && String(next.zone).trim()) {
      next.zone = String(next.zone).trim();
      next.market = next.zone;
    }
    // Drop client-sent zone so it never drifts from market
    if (next.market && next.zone && next.zone !== next.market) {
      next.zone = next.market;
    }

    // matchers removed — strip if still sent by older clients
    delete next.matchers;

    const coords = next.geo?.center?.coordinates;
    const valid =
      Array.isArray(coords) &&
      coords.length === 2 &&
      Number.isFinite(Number(coords[0])) &&
      Number.isFinite(Number(coords[1]));

    if (!valid) {
      delete next.geo;
    } else {
      next.geo = {
        center: {
          type: "Point",
          coordinates: [Number(coords[0]), Number(coords[1])],
        },
        radiusMiles:
          next.geo.radiusMiles == null || next.geo.radiusMiles === ""
            ? undefined
            : Number(next.geo.radiusMiles),
      };
    }
    return next;
  }

  async createPricingZone(data) {
    try {
      const payload = this.sanitizePricingZonePayload(data);
      // Clients cannot mint a second Global Rate
      if (payload.isGlobal) {
        throw new BadRequestError(
          "Global Rate already exists — open it from Market Pricing to update",
        );
      }
      delete payload.isGlobal;
      if (!payload.market) {
        throw new BadRequestError("market is required");
      }
      if (
        String(payload.market).toLowerCase() === GLOBAL_RATE_MARKET.toLowerCase() ||
        String(payload.state).toLowerCase() === GLOBAL_RATE_STATE.toLowerCase()
      ) {
        throw new BadRequestError(
          "Use the built-in Global Rate entry — it cannot be recreated",
        );
      }
      const existing = await DumpsterPricingZone.findOne({
        state: payload.state,
        market: payload.market,
      }).lean();
      if (existing) {
        throw new ConflictError(
          "Pricing for this state/market already exists",
        );
      }
      await this.purgeLegacyMatchers();
      const created = await DumpsterPricingZone.create(payload);
      return this.toPricingZoneResponse(created);
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async updatePricingZone(id, data) {
    try {
      if (!isValidObjectId(id)) {
        throw new NotFoundError("Pricing zone not found");
      }
      const current = await DumpsterPricingZone.findById(id).lean();
      if (!current) throw new NotFoundError("Pricing zone not found");

      const payload = this.sanitizePricingZonePayload(data);

      // Global Rate: rates/status only — lock identity fields
      if (current.isGlobal) {
        const allowed = {};
        if (payload.rates) allowed.rates = payload.rates;
        if (payload.status) allowed.status = payload.status;
        if (payload.description != null) allowed.description = payload.description;
        const update = { $set: allowed, $unset: { matchers: 1 } };
        const zone = await DumpsterPricingZone.findByIdAndUpdate(id, update, {
          new: true,
          runValidators: true,
        });
        return this.toPricingZoneResponse(zone);
      }

      delete payload.isGlobal;

      if (payload.state || payload.market) {
        const clash = await DumpsterPricingZone.findOne({
          _id: { $ne: id },
          state: payload.state ?? current.state,
          market: payload.market ?? current.market,
        }).lean();
        if (clash) {
          throw new ConflictError(
            "Pricing for this state/market already exists",
          );
        }
      }

      const update = { $set: payload, $unset: { matchers: 1 } };
      // If caller sent empty/invalid geo, clear it so the sparse index stays valid
      if (Object.prototype.hasOwnProperty.call(data, "geo") && !payload.geo) {
        update.$unset.geo = 1;
        delete update.$set.geo;
      }

      const zone = await DumpsterPricingZone.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });
      if (!zone) throw new NotFoundError("Pricing zone not found");
      return this.toPricingZoneResponse(zone);
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async getAllPricingZones({
    page = 1,
    limit = 50,
    search,
    status,
    state,
    market,
    sortBy = "state",
    sortOrder = "asc",
  } = {}) {
    try {
      await this.purgeLegacyMatchers();
      await this.ensureGlobalPricingZone();

      const query = {};
      if (status) query.status = status === "inactive" ? "deactive" : status;
      if (state) query.state = { $regex: String(state), $options: "i" };
      if (market) query.market = { $regex: String(market), $options: "i" };
      if (search) {
        query.$or = [
          { state: { $regex: search, $options: "i" } },
          { stateCode: { $regex: search, $options: "i" } },
          { market: { $regex: search, $options: "i" } },
          { zone: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 50;
      const order = sortOrder === "desc" ? -1 : 1;

      const [zones, total] = await Promise.all([
        DumpsterPricingZone.find(query)
          .select("-matchers")
          .sort({ isGlobal: -1, [sortBy]: order, market: 1, zone: 1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        DumpsterPricingZone.countDocuments(query),
      ]);

      return {
        zones: zones.map((z) => this.toPricingZoneResponse(z)),
        total,
        page: pageNum,
        limit: limitNum,
        currentPageSize: zones.length,
        totalPages: Math.ceil(total / limitNum) || 1,
      };
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async getPricingZoneById(id) {
    try {
      if (!isValidObjectId(id)) {
        throw new NotFoundError("Pricing zone not found");
      }
      await this.purgeLegacyMatchers();
      const zone = await DumpsterPricingZone.findById(id)
        .select("-matchers")
        .lean();
      if (!zone) throw new NotFoundError("Pricing zone not found");
      return this.toPricingZoneResponse(zone);
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async deletePricingZone(id) {
    try {
      if (!isValidObjectId(id)) {
        throw new NotFoundError("Pricing zone not found");
      }
      const existing = await DumpsterPricingZone.findById(id).lean();
      if (!existing) throw new NotFoundError("Pricing zone not found");
      if (existing.isGlobal) {
        throw new BadRequestError(
          "Global Rate cannot be deleted — you can only update it",
        );
      }
      const zone = await DumpsterPricingZone.findByIdAndDelete(id);
      if (!zone) throw new NotFoundError("Pricing zone not found");
      return this.toPricingZoneResponse(zone);
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  async updatePricingZoneStatus(id, status) {
    try {
      const normalized =
        status === "inactive" ? "deactive" : status === "deactive" ? "deactive" : "active";
      const zone = await DumpsterPricingZone.findByIdAndUpdate(
        id,
        { $set: { status: normalized }, $unset: { matchers: 1 } },
        { new: true },
      );
      if (!zone) throw new NotFoundError("Pricing zone not found");
      return this.toPricingZoneResponse(zone);
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
