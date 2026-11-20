import mongoose from "mongoose";
import User from "../../models/User.js";
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";

/**
 * GET /api/admin/chat-directory?type=all|renter|rentee&search=&page=1&limit=10
 *
 * One paginated list for the admin chat: every owner / customer, with the admin's
 * conversation (last message + unread count) already attached when one exists.
 * People with a conversation come first (latest activity first), then everyone else by name,
 * so the admin can open a brand-new chat with anyone from the same list.
 */
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function getChatDirectory(req, res, next) {
  try {
    const adminId = new mongoose.Types.ObjectId(String(req.assignBy || req.user._id));
    const type = ["renter", "rentee"].includes(req.query.type) ? req.query.type : "all";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = String(req.query.search || "").trim();

    // 1) The admin's conversations → other participant + last activity.
    const convs = await Conversation.find({ participants: adminId, status: { $ne: "closed" } })
      .select("participants lastActivity lastMessage")
      .lean();
    const byUser = new Map();
    for (const c of convs) {
      const other = (c.participants || []).find((p) => String(p) !== String(adminId));
      if (!other) continue;
      const prev = byUser.get(String(other));
      if (!prev || new Date(c.lastActivity || 0) > new Date(prev.lastActivity || 0)) {
        byUser.set(String(other), { convId: c._id, lastActivity: c.lastActivity, lastMessage: c.lastMessage });
      }
    }
    const otherIds = [...byUser.keys()].map((id) => new mongoose.Types.ObjectId(id));
    const activities = otherIds.map((id) => byUser.get(String(id)).lastActivity || new Date(0));

    // 2) People, ranked so existing conversations come first.
    const roleMatch =
      type === "all"
        ? { $or: [{ role: { $in: ["renter", "rentee"] } }, { type: { $in: ["renter", "rentee"] } }] }
        : { $or: [{ role: type }, { type }] };
    const and = [roleMatch, { status: { $ne: "deleted" } }, { _id: { $ne: adminId } }];
    // Search names, emails, phones AND the text of messages in the admin's conversations.
    const matchedByUser = new Map();
    if (search) {
      const rx = new RegExp(escapeRx(search), "i");
      const hits = await Message.find({
        $or: [{ senderId: adminId }, { receiverId: adminId }],
        content: rx,
      })
        .select("senderId receiverId content timestamp")
        .sort({ timestamp: -1 })
        .limit(500)
        .lean();
      for (const m of hits) {
        const other = String(m.senderId) === String(adminId) ? m.receiverId : m.senderId;
        if (other && !matchedByUser.has(String(other))) matchedByUser.set(String(other), m);
      }
      const msgUserIds = [...matchedByUser.keys()].map((id) => new mongoose.Types.ObjectId(id));
      and.push({ $or: [{ name: rx }, { email: rx }, { phone: rx }, { comp_name: rx }, { _id: { $in: msgUserIds } }] });
    }

    const [result] = await User.aggregate([
      { $match: { $and: and } },
      {
        $addFields: {
          __idx: { $indexOfArray: [otherIds, "$_id"] },
        },
      },
      {
        $addFields: {
          __hasConv: { $cond: [{ $gte: ["$__idx", 0] }, 1, 0] },
          __last: { $cond: [{ $gte: ["$__idx", 0] }, { $arrayElemAt: [activities, "$__idx"] }, null] },
          __name: { $toLower: { $ifNull: ["$name", ""] } },
        },
      },
      { $sort: { __hasConv: -1, __last: -1, __name: 1, _id: 1 } },
      {
        $facet: {
          rows: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: { name: 1, email: 1, phone: 1, role: 1, type: 1, profilePicture: 1, comp_name: 1, status: 1 } },
          ],
          total: [{ $count: "n" }],
        },
      },
    ]);

    const rows = result?.rows || [];
    const total = result?.total?.[0]?.n || 0;

    // 3) Attach last message + unread counts for this page only.
    const pageConvIds = rows.map((u) => byUser.get(String(u._id))?.convId).filter(Boolean);
    const lastIds = rows.map((u) => byUser.get(String(u._id))?.lastMessage).filter(Boolean);
    const [lastMessages, unread] = await Promise.all([
      lastIds.length
        ? Message.find({ _id: { $in: lastIds } })
            .select("content type attachment senderId receiverId timestamp deliveryStatus status")
            .lean()
        : [],
      pageConvIds.length
        ? Message.aggregate([
            { $match: { conversationId: { $in: pageConvIds }, receiverId: adminId, "deliveryStatus.read": false } },
            { $group: { _id: "$conversationId", count: { $sum: 1 } } },
          ])
        : [],
    ]);
    const msgMap = new Map(lastMessages.map((m) => [String(m._id), m]));
    const unreadMap = new Map(unread.map((u) => [String(u._id), u.count]));

    const data = rows.map((u) => {
      const conv = byUser.get(String(u._id));
      return {
        _id: conv ? String(conv.convId) : String(u._id),
        isNew: !conv,
        otherUser: u,
        lastMessage: conv?.lastMessage ? msgMap.get(String(conv.lastMessage)) || null : null,
        lastActivity: conv?.lastActivity || null,
        unreadCount: conv ? unreadMap.get(String(conv.convId)) || 0 : 0,
        matchedMessage: matchedByUser.get(String(u._id)) || null,
      };
    });

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), hasMore: page * limit < total },
    });
  } catch (error) {
    next(error);
  }
}
