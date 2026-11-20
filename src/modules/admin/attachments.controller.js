import mongoose from "mongoose";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import Dustbin from "../../models/Dustbin.js";
import JunkRemoval from "../../models/JunkRemoval.js";
import TreeRemoval from "../../models/TreeRemoval.js";
import Company from "../../models/Company.js";
import Message from "../../models/Message.js";
import AdminManualReviewRequest from "../../models/AdminManualReviewRequests.js";
import SalesLead from "../../models/SalesLead.js";
import { BadRequestError, NotFoundError } from "../../utils/apiError.js";

/**
 * Admin "Attachments" library.
 *
 * Files are uploaded to storage and only their URLs are kept on the records they belong to,
 * so this module walks the known file fields of each model and turns them into one list:
 * which file, who uploaded it, for which service / record, and when.
 * The list is rebuilt at most once a minute.
 */
const PER_SOURCE = 2000;
const CACHE_MS = 60 * 1000;
let cache = { at: 0, items: null, building: null };

const get = (obj, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), obj);
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => typeof x === "string" && /^https?:\/\//i.test(x));

export const fileKind = (url, mimetype) => {
  const s = `${mimetype || ""} ${String(url || "").split("?")[0]}`.toLowerCase();
  if (/image\/|\.(png|jpe?g|gif|webp|heic|heif|bmp|avif|svg)\b/.test(s)) return "image";
  if (/pdf/.test(s)) return "pdf";
  if (/video\/|\.(mp4|mov|webm)\b/.test(s)) return "video";
  if (/audio\/|\.(mp3|m4a|wav|ogg)\b/.test(s)) return "audio";
  return "document";
};
const fileName = (url) => decodeURIComponent(String(url || "").split("?")[0].split("/").pop() || "file");

const userHref = (u) => (u?._id ? (u.role === "renter" || u.type === "renter" ? `/renters/${u._id}` : `/rentees/${u._id}`) : null);

/**
 * Each source: model, filter, which fields hold files (+ label + who uploaded it),
 * the service it belongs to and where its record lives in the admin.
 */
const SOURCES = [
  {
    key: "account",
    service: "Account documents",
    model: User,
    match: { $or: [{ driving_license: { $nin: [null, ""] } }, { insuranceFile: { $nin: [null, ""] } }] },
    select: "driving_license insuranceFile createdAt updatedAt name email role type",
    fields: [
      { path: "driving_license", label: "Driver's license" },
      { path: "insuranceFile", label: "Insurance" },
    ],
    owner: (d) => d._id,
    record: (d, u) => ({ title: d.name || d.email || "Account", href: userHref(u || d) }),
  },
  {
    key: "bins",
    service: "Dumpster bins",
    model: Dustbin,
    match: { $or: [{ insurancefile: { $nin: [null, ""] } }, { registrationfile: { $nin: [null, ""] } }] },
    select: "insurancefile registrationfile user createdAt updatedAt size name",
    fields: [
      { path: "insurancefile", label: "Bin insurance" },
      { path: "registrationfile", label: "Bin registration" },
    ],
    owner: (d) => d.user,
    record: (d) => ({ title: `Bin ${d.size ? `${d.size} yd` : ""}`.trim(), href: d.user ? `/renters/${d.user}?tab=bins` : null }),
  },
  {
    key: "junk",
    service: "Junk removal",
    model: JunkRemoval,
    match: {},
    select: "drivers_license COI Business_license userId createdAt updatedAt",
    fields: [
      { path: "drivers_license", label: "Driver's license" },
      { path: "COI", label: "Certificate of insurance" },
      { path: "Business_license", label: "Business license" },
    ],
    owner: (d) => d.userId,
    record: (d) => ({ title: "Junk removal service", href: d.userId ? `/renters/${d.userId}?tab=junk` : null }),
  },
  {
    key: "tree",
    service: "Tree removal",
    model: TreeRemoval,
    match: {},
    select: "drivers_license COI Tree_removal_license userId createdAt updatedAt",
    fields: [
      { path: "drivers_license", label: "Driver's license" },
      { path: "COI", label: "Certificate of insurance" },
      { path: "Tree_removal_license", label: "Tree removal license" },
    ],
    owner: (d) => d.userId,
    record: (d) => ({ title: "Tree removal service", href: d.userId ? `/renters/${d.userId}?tab=tree` : null }),
  },
  {
    key: "company",
    service: "Commercial company",
    model: Company,
    match: { COI: { $nin: [null, ""] } },
    select: "COI user name createdAt updatedAt",
    fields: [{ path: "COI", label: "Certificate of insurance" }],
    owner: (d) => d.user,
    record: (d) => ({ title: d.name || "Company", href: `/commercial-portal/${d._id}` }),
  },
  {
    key: "manual",
    service: "Manual requests",
    model: AdminManualReviewRequest,
    match: { "images.0": { $exists: true } },
    select: "images userId service_type createdAt updatedAt",
    fields: [{ path: "images", label: "Request photo" }],
    owner: (d) => d.userId,
    serviceOf: (d) => (d.service_type ? `Manual request · ${String(d.service_type).replace(/_/g, " ")}` : "Manual requests"),
    record: (d) => ({ title: "Manual review request", href: `/manual-reviews/${d._id}` }),
  },
  {
    key: "orders",
    service: "Orders",
    model: Order,
    match: {
      $or: [
        { "images.0": { $exists: true } },
        { dropoffimage: { $nin: [null, ""] } },
        { insurance: { $nin: [null, ""] } },
        { image: { $nin: [null, ""] } },
        { "placementPhotos.0": { $exists: true } },
        { "deliveryWorkflow.deliveryPhotos.0": { $exists: true } },
        { "pickupWorkflow.beforePickupPhotos.0": { $exists: true } },
        { "pickupWorkflow.afterPickupPhotos.0": { $exists: true } },
        { "swapWorkflow.existingUnitPhotos.0": { $exists: true } },
        { "swapWorkflow.replacementPhotos.0": { $exists: true } },
        { scaleSlipImage: { $nin: [null, ""] } },
      ],
    },
    select:
      "images dropoffimage insurance image placementPhotos deliveryWorkflow.deliveryPhotos pickupWorkflow.beforePickupPhotos pickupWorkflow.afterPickupPhotos swapWorkflow.existingUnitPhotos swapWorkflow.replacementPhotos scaleSlipImage user to_id orderNumber service_type createdAt updatedAt",
    fields: [
      { path: "images", label: "Order photo", by: "customer" },
      { path: "placementPhotos", label: "Placement photo", by: "customer" },
      { path: "insurance", label: "Insurance", by: "customer" },
      { path: "image", label: "Order image", by: "customer" },
      { path: "dropoffimage", label: "Drop-off photo", by: "provider" },
      { path: "deliveryWorkflow.deliveryPhotos", label: "Delivery photo", by: "provider" },
      { path: "pickupWorkflow.beforePickupPhotos", label: "Before pickup", by: "provider" },
      { path: "pickupWorkflow.afterPickupPhotos", label: "After pickup", by: "provider" },
      { path: "swapWorkflow.existingUnitPhotos", label: "Swap — old unit", by: "provider" },
      { path: "swapWorkflow.replacementPhotos", label: "Swap — new unit", by: "provider" },
      { path: "scaleSlipImage", label: "Scale slip", by: "provider" },
    ],
    owner: (d, field) => (field.by === "provider" ? d.to_id : d.user),
    serviceOf: (d) => (d.service_type ? `Orders · ${String(d.service_type).replace(/_/g, " ")}` : "Orders"),
    record: (d) => ({ title: `Order ${d.orderNumber ? `ORD-${String(d.orderNumber).replace(/^#/, "")}` : String(d._id).slice(-6).toUpperCase()}`, href: `/all-orders/${d._id}` }),
  },
  {
    key: "chat",
    service: "Chat",
    model: Message,
    match: { "attachment.url": { $nin: [null, ""] } },
    select: "attachment senderId receiverId conversationId timestamp createdAt type",
    fields: [{ path: "attachment.url", label: "Chat attachment" }],
    owner: (d) => d.senderId,
    date: (d) => d.timestamp || d.createdAt,
    nameOf: (d) => d.attachment?.filename,
    mimeOf: (d) => d.attachment?.mimetype,
    sizeOf: (d) => d.attachment?.size,
    record: (d) => ({ title: "Chat message", href: d.conversationId ? `/chat-monitoring/${d.conversationId}` : "/chat-monitoring" }),
  },
  {
    key: "leads",
    service: "Sales leads",
    model: SalesLead,
    match: { "serviceDetails.photos.0": { $exists: true } },
    select: "serviceDetails.photos contact createdAt updatedAt",
    fields: [{ path: "serviceDetails.photos", label: "Project photo" }],
    owner: () => null,
    guest: (d) => (d.contact?.name || d.contact?.email ? { name: d.contact?.name || d.contact?.email, email: d.contact?.email } : null),
    record: (d) => ({ title: `Lead · ${d.contact?.name || "visitor"}`, href: `/commercial-portal/leads/sales/${d._id}` }),
  },
];

async function buildIndex() {
  const raw = [];
  const ownerIds = new Set();
  await Promise.all(
    SOURCES.map(async (src) => {
      try {
        const docs = await src.model.find(src.match).select(src.select).sort({ createdAt: -1 }).limit(PER_SOURCE).lean();
        for (const d of docs) {
          for (const field of src.fields) {
            asList(get(d, field.path)).forEach((url, i) => {
              const owner = src.owner(d, field);
              if (owner) ownerIds.add(String(owner));
              raw.push({ src, d, field, url, i, owner: owner ? String(owner) : null });
            });
          }
        }
      } catch {
        /* a broken source shouldn't hide the others */
      }
    }),
  );

  const users = await User.find({ _id: { $in: [...ownerIds].map((id) => new mongoose.Types.ObjectId(id)) } })
    .select("name email phone role type profilePicture")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return raw
    .map(({ src, d, field, url, i, owner }) => {
      const u = owner ? userMap.get(owner) : null;
      const rec = src.record(d, u);
      const guest = !u && src.guest ? src.guest(d) : null;
      const mimetype = src.mimeOf ? src.mimeOf(d) : undefined;
      return {
        id: `${src.key}~${d._id}~${field.path}~${i}`,
        url,
        name: (src.nameOf && src.nameOf(d)) || fileName(url),
        kind: fileKind(url, mimetype),
        size: src.sizeOf ? src.sizeOf(d) || null : null,
        label: field.label,
        source: src.key,
        service: src.serviceOf ? src.serviceOf(d) : src.service,
        uploadedBy: u
          ? { _id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role, type: u.type, profilePicture: u.profilePicture, href: userHref(u) }
          : guest
            ? { ...guest, guest: true }
            : null,
        record: { id: String(d._id), title: rec.title, href: rec.href },
        uploadedAt: (src.date ? src.date(d) : d.updatedAt || d.createdAt) || null,
      };
    })
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
}

async function getIndex(force = false) {
  if (!force && cache.items && Date.now() - cache.at < CACHE_MS) return cache.items;
  if (cache.building) return cache.building;
  cache.building = buildIndex()
    .then((items) => {
      cache = { at: Date.now(), items, building: null };
      return items;
    })
    .catch((e) => {
      cache.building = null;
      throw e;
    });
  return cache.building;
}

/** GET /api/admin/attachments?search=&source=&kind=&user=&sort=newest|oldest|user|service&page=&limit= */
export async function listAttachments(req, res, next) {
  try {
    const { search = "", source = "all", kind = "all", user = "", sort = "newest", refresh } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const all = await getIndex(refresh === "1");

    const bySource = {};
    for (const it of all) bySource[it.source] = (bySource[it.source] || 0) + 1;

    let rows = all;
    if (source !== "all") rows = rows.filter((r) => r.source === source);
    if (kind !== "all") rows = rows.filter((r) => (kind === "document" ? r.kind !== "image" : r.kind === kind));
    // People list for the "Uploaded by" filter = people with files in this tab and type.
    const scoped = rows;
    if (user) rows = rows.filter((r) => String(r.uploadedBy?._id || "") === String(user));
    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter((r) =>
        [r.name, r.label, r.service, r.record?.title, r.uploadedBy?.name, r.uploadedBy?.email].some((v) => String(v || "").toLowerCase().includes(q)),
      );
    }
    if (sort === "oldest") rows = [...rows].reverse();
    const newer = (a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0);
    if (sort === "user")
      rows = [...rows].sort((a, b) => String(a.uploadedBy?.name || "~").localeCompare(String(b.uploadedBy?.name || "~")) || newer(a, b));
    if (sort === "service") rows = [...rows].sort((a, b) => String(a.service || "").localeCompare(String(b.service || "")) || newer(a, b));

    // Top uploaders for the user filter.
    const counts = new Map();
    for (const r of scoped) if (r.uploadedBy?._id) counts.set(String(r.uploadedBy._id), { user: r.uploadedBy, n: (counts.get(String(r.uploadedBy._id))?.n || 0) + 1 });
    const uploaders = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 200).map(({ user: u, n }) => ({ _id: u._id, name: u.name || u.email, count: n }));
    // Keep the picked person in the list even when they have no files in this view.
    if (user && !uploaders.some((u) => String(u._id) === String(user))) {
      const hit = all.find((r) => String(r.uploadedBy?._id || "") === String(user));
      uploaders.unshift({ _id: user, name: hit?.uploadedBy?.name || hit?.uploadedBy?.email || "Picked person", count: 0 });
    }

    res.json({
      success: true,
      data: {
        items: rows.slice((page - 1) * limit, page * limit),
        total: rows.length,
        page,
        totalPages: Math.max(1, Math.ceil(rows.length / limit)),
        sources: SOURCES.map((s) => ({ key: s.key, label: s.service, count: bySource[s.key] || 0 })),
        totalAll: all.length,
        uploaders,
        builtAt: cache.at,
      },
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/attachments/item?id=… — one file plus the other files on the same record and by the same person. */
export async function getAttachment(req, res, next) {
  try {
    const id = String(req.query.id || "");
    if (!id.includes("~")) throw new BadRequestError("Invalid attachment id");
    let all = await getIndex();
    let item = all.find((r) => r.id === id);
    if (!item) {
      all = await getIndex(true);
      item = all.find((r) => r.id === id);
    }
    if (!item) throw new NotFoundError("This file is no longer attached to anything");
    const sameRecord = all.filter((r) => r.id !== id && r.source === item.source && r.record.id === item.record.id);
    const sameUser = item.uploadedBy?._id
      ? all.filter((r) => r.id !== id && String(r.uploadedBy?._id) === String(item.uploadedBy._id) && r.record.id !== item.record.id).slice(0, 24)
      : [];
    res.json({ success: true, data: { item, sameRecord, sameUser } });
  } catch (error) {
    next(error);
  }
}
