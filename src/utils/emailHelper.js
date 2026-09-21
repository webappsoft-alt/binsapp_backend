import nodemailer from "nodemailer";
// import config from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: "mail.binsapp.ai",
  port: 587,
  secure: false,
  pool: true,
  maxConnections: 1,
  rateLimit: 1,
  maxMessages: 100,
  auth: {
    user: "info@binsapp.ai",
    pass: "I7;jnC3s&,q-",
  },
});

export async function sendEmail({ to, subject, text, html }) {
  const attachments = [
    {
      filename: "waste-advantage.png",
      path: "https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1775645696505.png", // Local path to your file
      cid: "b06898b8-fa5f-498d-b624-a91b53f7a476", // Must match the Content-ID in headers
    },
    {
      filename: "bins-app-logo.png",
      path: "https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1775645883179.png",
      cid: "4a6429ec-8f85-4b53-a4a0-6acd099f343f",
    },
    {
      filename: "QR-code.png",
      path: "https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1775645732942.png",
      cid: "14f879c7-9622-4d49-b806-4f952c73a2b5",
    },
  ];

  const mailOptions = {
    from: "info@binsapp.ai", // "Your App <noreply@yourdomain.com>"
    to,
    subject,
    text,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ Email sending failed:", err);
    return { success: false, error: err.message };
  }
}
