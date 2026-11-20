import User from "../../models/User.js";
import Template from "../../models/Template.js";
import NotificationBroadcast from "../../models/NotificationBroadcast.js";
import NotificationSettings from "../../models/NotificationSettings.js";
import { sendNotification } from "../../utils/notifications.js";
import { sendEmail } from "../../utils/emailHelper.js";
import { sendSMS } from "../../utils/sendSMS.js";
import { partnerUpdateEmailHtml } from "../../utils/emailservice.js";
import { applyTemplateOverride } from "../../utils/templateOverrides.js";
import { renderTemplateString } from "../../utils/templateEngine.js";
import { BadRequestError, NotFoundError } from "../../utils/apiError.js";
import logger from "../../config/logger.js";

const AUDIENCES = ["all", "renter", "rentee", "commercial", "users"];
const CHANNELS = ["push", "email", "sms"];

export async function getSettingsDoc() {
  let doc = await NotificationSettings.findOne({ key: "default" });
  if (!doc) doc = await NotificationSettings.create({ key: "default" });
  return doc;
}

function audienceQuery(audience, users, skipInactive) {
  const query = {};
  if (audience === "renter" || audience === "rentee") {
    query.$or = [{ role: audience }, { type: audience }];
  } else if (audience === "commercial") {
    query.$or = [{ access_types: "company" }, { company: { $exists: true, $ne: null } }];
  } else if (audience === "users") {
    query._id = { $in: users || [] };
  } else {
    query.$or = [{ role: { $in: ["rentee", "renter"] } }, { type: { $in: ["rentee", "renter"] } }];
  }
  query.status = skipInactive ? { $nin: ["deleted", "deactivated"] } : { $ne: "deleted" };
  return query;
}

const plainName = (u) => u?.name || u?.email?.split("@")[0] || "there";

/** Wrap editor HTML in the branded layout unless it's already a full email document. */
function buildEmailHtml(html, subject, branded) {
  if (!html) return "";
  if (/<html[\s>]/i.test(html) || !branded) return html;
  return applyTemplateOverride("partner_update", { subject, description: html }, partnerUpdateEmailHtml(subject, html));
}

async function runBroadcast(broadcastId, recipients, payload, settings) {
  const doc = await NotificationBroadcast.findById(broadcastId);
  if (!doc) return;
  const { channels, push, email, sms, sentBy } = payload;
  const results = {
    push: { attempted: 0, sent: 0, failed: 0, skipped: 0 },
    email: { attempted: 0, sent: 0, failed: 0, skipped: 0 },
    sms: { attempted: 0, sent: 0, failed: 0, skipped: 0 },
  };
  const rows = [];

  for (const u of recipients) {
    const vars = { name: plainName(u), email: u.email || "", phone: u.phone || "", year: new Date().getFullYear() };
    const row = { user: u._id, name: u.name, email: u.email, phone: u.phone };

    if (channels.includes("push")) {
      results.push.attempted += 1;
      try {
        await sendNotification({
          user: sentBy ? String(sentBy) : "",
          to_id: String(u._id),
          title: renderTemplateString(push.title, vars),
          description: renderTemplateString(push.description, vars),
          fcmtoken: u.fcmtoken || "",
          imageUrl: push.imageUrl || "",
          type: "admin-noti",
          metadata: { broadcastId: String(broadcastId) },
        });
        results.push.sent += 1;
        row.push = "sent";
      } catch (e) {
        results.push.failed += 1;
        row.push = "failed";
        row.error = e?.message;
      }
    }

    if (channels.includes("email")) {
      if (!u.email) {
        results.email.skipped += 1;
        row.email_status = "skipped";
      } else {
        results.email.attempted += 1;
        const subject = renderTemplateString(email.subject, vars);
        const html = buildEmailHtml(renderTemplateString(email.html, vars), subject, settings.email?.useBrandedLayout !== false);
        const r = await sendEmail({ to: u.email, subject, html });
        if (r?.success) {
          results.email.sent += 1;
          row.email_status = "sent";
        } else {
          results.email.failed += 1;
          row.email_status = "failed";
          row.error = r?.error;
        }
      }
    }

    if (channels.includes("sms")) {
      if (!u.phone) {
        results.sms.skipped += 1;
        row.sms = "skipped";
      } else {
        results.sms.attempted += 1;
        let body = renderTemplateString(sms.body, vars);
        if (settings.sms?.appendFooter && settings.sms?.footer) body = `${body}\n${settings.sms.footer}`;
        try {
          const r = await sendSMS({
            to: u.phone,
            body,
            mediaUrl: sms.mediaUrl || undefined,
            type: "general",
            metadata: { broadcastId: String(broadcastId), userId: String(u._id) },
          });
          if (r?.success) {
            results.sms.sent += 1;
            row.sms = "sent";
          } else {
            results.sms.failed += 1;
            row.sms = "failed";
            row.error = r?.message;
          }
        } catch (e) {
          results.sms.failed += 1;
          row.sms = "failed";
          row.error = e?.message;
        }
      }
    }
    rows.push(row);
  }

  const attempted = CHANNELS.reduce((s, c) => s + results[c].attempted, 0);
  const failed = CHANNELS.reduce((s, c) => s + results[c].failed, 0);
  doc.results = results;
  doc.recipients = rows.slice(0, 2000);
  doc.status = attempted === 0 ? "failed" : failed === 0 ? "sent" : failed >= attempted ? "failed" : "partial";
  doc.completedAt = new Date();
  await doc.save();
}

/** POST /api/admin/broadcasts — send one notification over any mix of push / email / sms. */
export async function createBroadcast(req, res, next) {
  try {
    const { audience, users = [], channels = [], push = {}, email = {}, sms = {} } = req.body || {};
    if (!AUDIENCES.includes(audience)) throw new BadRequestError(`audience must be one of ${AUDIENCES.join(", ")}`);
    const settings = await getSettingsDoc();
    const wanted = [...new Set(channels)].filter((c) => CHANNELS.includes(c));
    if (!wanted.length) throw new BadRequestError("Pick at least one channel");
    const disabled = wanted.filter((c) => settings.channels?.[c] === false);
    if (disabled.length) throw new BadRequestError(`Channel disabled in notification settings: ${disabled.join(", ")}`);
    if (audience === "users" && !users.length) throw new BadRequestError("Select at least one user");

    if (wanted.includes("push") && (!push.title?.trim() || !push.description?.trim()))
      throw new BadRequestError("Push title and message are required");
    if (wanted.includes("email") && (!email.subject?.trim() || !email.html?.trim()))
      throw new BadRequestError("Email subject and content are required");
    if (wanted.includes("sms")) {
      if (!sms.body?.trim() && !sms.mediaUrl) throw new BadRequestError("SMS text is required");
      if ((sms.body || "").length > 1600) throw new BadRequestError("SMS text is longer than 1600 characters");
    }

    let templateTitle;
    if (email.templateId) {
      const t = await Template.findById(email.templateId).select("title").lean();
      templateTitle = t?.title;
    }

    const recipients = await User.find(audienceQuery(audience, users, settings.skipInactiveUsers))
      .select("name email phone fcmtoken")
      .lean();
    if (!recipients.length) throw new BadRequestError("No recipients match this audience");

    const doc = await NotificationBroadcast.create({
      audience,
      channels: wanted,
      push: wanted.includes("push") ? { title: push.title, description: push.description, imageUrl: push.imageUrl } : undefined,
      email: wanted.includes("email")
        ? { subject: email.subject, html: email.html, templateId: email.templateId || null, templateTitle }
        : undefined,
      sms: wanted.includes("sms") ? { body: sms.body, mediaUrl: sms.mediaUrl } : undefined,
      recipientCount: recipients.length,
      status: "sending",
      sentBy: req.user?._id || null,
    });

    // Deliver in the background; the History tab polls the status.
    runBroadcast(doc._id, recipients, { channels: wanted, push, email, sms, sentBy: req.user?._id }, settings).catch(
      async (err) => {
        logger.error(`broadcast ${doc._id} failed: ${err?.message}`);
        await NotificationBroadcast.updateOne({ _id: doc._id }, { status: "failed", completedAt: new Date() });
      },
    );

    res.status(201).json({ success: true, message: `Sending to ${recipients.length} recipient(s)`, data: doc });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/broadcasts/preview-count?audience=&users= — how many people a send will reach. */
export async function previewBroadcastAudience(req, res, next) {
  try {
    const { audience = "all" } = req.query;
    const users = String(req.query.users || "")
      .split(",")
      .filter(Boolean);
    const settings = await getSettingsDoc();
    const q = audienceQuery(audience, users, settings.skipInactiveUsers);
    const [total, withEmail, withPhone, withPush] = await Promise.all([
      User.countDocuments(q),
      User.countDocuments({ ...q, email: { $exists: true, $nin: [null, ""] } }),
      User.countDocuments({ ...q, phone: { $exists: true, $nin: [null, ""] } }),
      User.countDocuments({ ...q, fcmtoken: { $exists: true, $nin: [null, ""] } }),
    ]);
    res.json({ success: true, data: { total, withEmail, withPhone, withPush } });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/broadcasts — history. */
export async function listBroadcasts(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const { channel, audience, status, search } = req.query;
    const q = {};
    if (channel && CHANNELS.includes(channel)) q.channels = channel;
    if (audience && AUDIENCES.includes(audience)) q.audience = audience;
    if (status && status !== "all") q.status = status;
    if (search) {
      const rx = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      q.$or = [{ "push.title": rx }, { "email.subject": rx }, { "sms.body": rx }, { "push.description": rx }];
    }
    const [rows, total, counts] = await Promise.all([
      NotificationBroadcast.find(q)
        .select("-recipients -email.html")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("sentBy", "name email")
        .lean(),
      NotificationBroadcast.countDocuments(q),
      NotificationBroadcast.aggregate([
        {
          $group: {
            _id: null,
            all: { $sum: 1 },
            push: { $sum: { $cond: [{ $in: ["push", "$channels"] }, 1, 0] } },
            email: { $sum: { $cond: [{ $in: ["email", "$channels"] }, 1, 0] } },
            sms: { $sum: { $cond: [{ $in: ["sms", "$channels"] }, 1, 0] } },
            recipients: { $sum: "$recipientCount" },
          },
        },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        broadcasts: rows,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        counts: counts[0] || { all: 0, push: 0, email: 0, sms: 0, recipients: 0 },
      },
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/broadcasts/:id */
export async function getBroadcast(req, res, next) {
  try {
    const doc = await NotificationBroadcast.findById(req.params.id).populate("sentBy", "name email").lean();
    if (!doc) throw new NotFoundError("Notification not found");
    res.json({ success: true, data: doc });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/notification-settings */
export async function getNotificationSettings(req, res, next) {
  try {
    res.json({ success: true, data: await getSettingsDoc() });
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/notification-settings */
export async function updateNotificationSettings(req, res, next) {
  try {
    const doc = await getSettingsDoc();
    const body = req.body || {};
    if (body.channels) {
      for (const c of CHANNELS) if (typeof body.channels[c] === "boolean") doc.channels[c] = body.channels[c];
    }
    if (body.audienceDefaults) {
      for (const a of AUDIENCES) {
        if (Array.isArray(body.audienceDefaults[a])) {
          doc.audienceDefaults[a] = body.audienceDefaults[a].filter((c) => CHANNELS.includes(c));
        }
      }
    }
    if (body.sms) {
      if (typeof body.sms.footer === "string") doc.sms.footer = body.sms.footer.slice(0, 120);
      if (typeof body.sms.appendFooter === "boolean") doc.sms.appendFooter = body.sms.appendFooter;
      if (Number(body.sms.maxLength) >= 70) doc.sms.maxLength = Math.min(1600, Number(body.sms.maxLength));
    }
    if (body.email) {
      if (typeof body.email.useBrandedLayout === "boolean") doc.email.useBrandedLayout = body.email.useBrandedLayout;
      if (typeof body.email.replyTo === "string") doc.email.replyTo = body.email.replyTo.trim();
    }
    if (typeof body.skipInactiveUsers === "boolean") doc.skipInactiveUsers = body.skipInactiveUsers;
    if (body.requireConfirmAbove !== undefined && Number(body.requireConfirmAbove) >= 0)
      doc.requireConfirmAbove = Number(body.requireConfirmAbove);
    doc.updatedBy = req.user?._id || null;
    doc.markModified("audienceDefaults");
    await doc.save();
    res.json({ success: true, message: "Notification settings saved", data: doc });
  } catch (error) {
    next(error);
  }
}
