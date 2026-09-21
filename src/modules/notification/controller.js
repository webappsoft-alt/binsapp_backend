import NotificationService from "./service.js";


export const getAllNotifications = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const { page, limit, isSeen } = req.query;
        const query = {
            to_id: userId,
        };
        if (isSeen !== undefined) {
            query.isSeen = isSeen;
        }

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