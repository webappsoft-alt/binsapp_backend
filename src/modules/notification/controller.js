import NotificationService from "./service.js";


const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Query params (all optional):
 *  page, limit
 *  tab      — all | unread | read | important
 *  search   — matches title/description ("important" also selects important ones)
 *  from, to — ISO bounds for createdAt (client sends its local day start/end)
 *  isSeen   — legacy true/false filter
 *  markSeen — "false" to NOT mark the matching notifications as seen (admin panel)
 */
export const getAllNotifications = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const { page, limit, isSeen, tab, search, from, to, markSeen } = req.query;
        const query = {
            to_id: userId,
        };
        if (isSeen !== undefined) {
            query.seen = String(isSeen) === "true";
        }
        if (tab === "unread") query.seen = false;
        if (tab === "read") query.seen = true;
        if (tab === "important") query.isImportant = true;
        // Website "Offers" tab: builder-offer deep links, invoices and any *offer* type
        const offerClause = tab === "offers"
            ? [
                { "metadata.kind": "builder_offer" },
                { type: "invoice_created" },
                { type: /offer/i },
            ]
            : null;

        const term = String(search || "").trim();
        if (term) {
            if (term.toLowerCase() === "important") {
                query.isImportant = true;
            } else {
                const rx = new RegExp(escapeRegex(term.slice(0, 100)), "i");
                query.$or = [{ title: rx }, { description: rx }];
            }
        }
        if (offerClause) {
            // Combine with a search $or without overwriting it
            if (query.$or) {
                query.$and = [{ $or: query.$or }, { $or: offerClause }];
                delete query.$or;
            } else {
                query.$or = offerClause;
            }
        }

        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        if ((fromDate && !isNaN(fromDate)) || (toDate && !isNaN(toDate))) {
            query.createdAt = {};
            if (fromDate && !isNaN(fromDate)) query.createdAt.$gte = fromDate;
            if (toDate && !isNaN(toDate)) query.createdAt.$lte = toDate;
        }

        const application = await NotificationService.getApplicationDetails(query, {
            page,
            limit,
            markSeen: String(markSeen) !== "false",
            countsFor: userId,
        });
        res.json({
            success: true,
            data: application,
            message: "Notifications fetched successfully",
        });
    } catch (error) {
        next(error);
    }
}

export const checkSeenNotifications = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const query = {
            to_id: userId,
            isSeen: false,
        };

        const application = await NotificationService.getApplicationDetails(query, {
            page, limit,
        });
        res.json({
            success: true,
            data: application,
            message: "Notifications fetched successfully",
        });
    } catch (error) {
        next(error);
    }
}

export const markNotificationsSeen = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const result = await NotificationService.markSeen(userId, req.body?.ids);
        res.json({
            success: true,
            data: result,
            message: "Notifications marked as seen",
        });
    } catch (error) {
        next(error);
    }
}

export const getUnreadNotificationCount = async (req, res, next) => {
    try {
        const unreadCount = await NotificationService.getUnreadCount(req.user._id.toString());
        res.json({ success: true, data: { unreadCount } });
    } catch (error) {
        next(error);
    }
}

export const deleteNotification = async (req, res, next) => {
    try {
        const notiId = req.params.id;
        const userId = req.user._id;
        const application = await NotificationService.deleteNotification(notiId, userId);
        res.json({
            success: true,
            data: application,
            message: "Notification deleted successfully",
        });
    } catch (error) {
        next(error);
    }
}