import admin from "../config/firebase.js";
import Notification from "../models/Notification.js";
import logger from "../config/logger.js";
import { sendAdminEmailToUser } from "./emailservice.js";
import { sendEmail } from "./emailHelper.js";
import { emitNewNotification } from "./notificationEvents.js";
export const sendNotification = async ({
  user = "",
  to_id = "",
  description = "",
  type = "",
  title = "",
  order = "",
  fcmtoken = "fYCyAIXQRXGHbhZxSbyAh7:APA91bGa4LrWKkY0nY1mzBYnQYBOOColXR8PgbqLkE-5UlrImgYrH31L3vj0uqWJxW87RIt4DGTbJCI7G694_ThZ0yt_7_Q50526VAA6-HM0pi23YRZfpTM",
  request = "",
  dustbin = "",
  noti = true,
  email = "",
  metadata,
  html,
  isImportant=false,
  customEmailTemplate = false,
  // Android notification channel + sound file (res/raw name, no extension).
  channelId = "bins_order_alerts",
  sound = "order_alert",
}) => {
  // return true;
  try {
    if (noti) {
      const updateFields = Object.fromEntries(
        Object.entries({
          user,
          to_id,
          type,
          order,
          description,
          title,
          request,
          dustbin,
          isImportant,
          metadata:
            metadata && typeof metadata === "object" ? metadata : undefined,
        }).filter(([key, value]) => value !== "" && value !== undefined),
      );

      const notification = new Notification(updateFields);

      await notification.save();

      // Real-time badge: push the new notification (plus the recipient's unread
      // total) to their socket room so apps update without a refresh.
      await emitNewNotification(notification);
    }

    if (email) {
      if (customEmailTemplate && html) {
        await sendEmail({
          to: email,
          subject: title,
          html: html,
        });
      } else {
        await sendAdminEmailToUser(email, title, false, description);
      }
    }

    if (fcmtoken) {
      // FCM data values must all be strings; include navigation fields so a tap
      // can route to the order/inbox even when the OS renders the notification.
      const dataPayload = {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
      };
      if (order) {
        dataPayload.order = order.toString();
        dataPayload.orderId = order.toString();
      }
      if (type) dataPayload.type = type.toString();
      if (title) dataPayload.title = title.toString();
      if (description) dataPayload.body = description.toString();

      // iOS custom sounds require the file bundled in the app build; fall back to
      // the default sound name otherwise. Android uses the res/raw name (no ext).
      const apnsSound =
        sound && sound !== "default" ? `${sound}.wav` : "default";

      const message = {
        token: fcmtoken, // replace with the user's device token
        notification: {
          title: title,
          body: description,
        },
        data: dataPayload,
        android: {
          priority: "high",
          notification: {
            channel_id: channelId,
            sound: sound || "default",
            default_vibrate_timings: true,
            notification_priority: "PRIORITY_HIGH",
          },
        },
        apns: {
          headers: {
            "apns-priority": "10",
          },
          payload: {
            aps: {
              sound: apnsSound,
              alert: {
                title: title,
                body: description,
              },
            },
          },
        },
      };

      // Log the outgoing FCM payload (token omitted) so QA can confirm the
      // data.order / data.orderId strings match what app navigation expects.
      logger.info(
        `FCM payload: ${JSON.stringify({
          notification: message.notification,
          data: message.data,
          android: message.android,
          apns: message.apns,
        })}`,
      );

      await admin.messaging().send(message);
      logger.info("Notification sent successfully");
    }
  } catch (error) {
    console.log(error);
    logger.error(error);
  }
};
