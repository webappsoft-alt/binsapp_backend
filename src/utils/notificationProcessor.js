import dotenv from "dotenv";
dotenv.config();
import config from "../config/env.js";
import dns from "node:dns";
import logger from "../config/logger.js";
import { Worker, isMainThread, parentPort } from "worker_threads";
import { sendNotification } from "./notifications.js";
import { sendAdminEmailToUser } from "./emailservice.js";
import mongoose from "mongoose";
import admin from "firebase-admin";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const db = config.get("mongodb");
mongoose.connect(db).then(() => logger.info(`Connected to worker db...`));
logger.info(`Worker processing Started Enter in file`);
const firebaseConfig = {
  type: config.get("firebase.type"),
  project_id: config.get("firebase.projectId"),
  client_email: config.get("firebase.clientEmail"),
  private_key: config.get("firebase.privateKey"),
  private_key_id: config.get("firebase.privateKeyId"),
  client_id: config.get("firebase.clientId"),
  auth_uri: config.get("firebase.authURI"),
  token_uri: config.get("firebase.tokenURI"),
  auth_provider_x509_cert_url: config.get("firebase.authProviderCertURL"),
  client_x509_cert_url: config.get("firebase.clientCertURL"),
  universe_domain: config.get("firebase.universeDomain"),
};
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
    storageBucket: "gs://dumpster-df2b0.appspot.com",
  });
} else {
  admin.app(); // Use the already initialized app
}

if (!isMainThread) {
  parentPort.on("message", async (job) => {
    console.log(`Worker processing: ${JSON.stringify(job.data.title)}`);
    for (let user of job.data.userslist) {
      console.log(`user._id processing: ${JSON.stringify(user)}`);
      await sendNotification({
        user: job.data.userId.toString(),
        to_id: user._id.toString(),
        description: job.data.description,
        title: job.data.title,
        fcmtoken: user.fcmtoken,
        type: "admin-noti",
        email: "",
      });

      if (user?.email) {
        await sendAdminEmailToUser(
          user.email,
          job.data.title,
          false,
          job.data.description,
        );
      }
    }

    parentPort.postMessage({ success: true });
  });
}
