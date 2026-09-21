import { createWorker } from "./bullmq.js";
import { logger } from "../config/logger.js";
import { sendNotification } from "./notifications.js";
import { sendAdminEmailToUser } from "./emailservice.js";

/**
 * BullMQ Worker for processing notifications
 * This replaces the manual worker_threads implementation
 */
export const initNotificationWorker = () => {
  return createWorker("notifications", async (job) => {
    const { userslist, userId, description, title } = job.data;
    
    logger.info(`Processing notification job [${job.id}]: ${title}`);
    
    for (let user of userslist) {
      try {
        await sendNotification({
          user: userId.toString(),
          to_id: user._id.toString(),
          description: description,
          title: title,
          fcmtoken: user.fcmtoken,
          type: "admin-noti",
          email: "",
        });

        if (user?.email) {
          await sendAdminEmailToUser(
            user.email,
            title,
            false,
            description,
          );
        }
      } catch (err) {
        logger.error(`Failed to send notification to user [${user._id}]: ${err.message}`);
        // We can choose to throw or continue. BullMQ will retry if we throw.
      }
    }
    
    return { success: true };
  }, {
    concurrency: 5, // Process 5 jobs at a time
  });
};
