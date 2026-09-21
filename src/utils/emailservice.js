import logger from "../config/logger.js";
import nodemailer from "nodemailer";
import config from "../config/env.js";

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
  // service: "Gmail",
  // auth: {
  //   user: config.get("email.user"),
  //   pass: config.get("email.pass"),
  // },
});
export const sendEmail = async (email, code) => {
  // Create a Nodemailer transporter object

  // Email data
  const mailOptions = {
    from: "info@binsapp.ai",
    to: email, // Replace with the recipient's email address
    subject: "OFC App Verification",
    text: "Your OFC App verification code is " + code,
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error("Error sending email: ", error);
    } else {
      logger.info("Email sent: " + info.response);
    }
  });
};

export const sendAdminEmailToUser = async (
  email,
  subject,
  html,
  description,
) => {
  // Create a Nodemailer transporter object
  const htmlTemplate = `
  
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bins App - Partner Update</title>
    <style>
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0; padding: 0;
            background-color: #f4f7f6;
            color: #333333;
        }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container {
            max-width: 600px;
            margin: 40px auto 20px;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        /* New Signature Footer Block */
        .sig-footer {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            padding: 30px 40px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
      
        }
        .header { padding: 40px 20px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 10px; }
        .description-box {
            background-color: #f0fff4;
            border: 1px solid #0EBE3C;
            padding: 15px 20px;
            border-radius: 8px;
            margin: 25px 0;
            display: inline-block;
        }
        .description { font-size: 18px; font-weight: 600; color: #0EBE3C; margin: 0; }
        .info-text { font-size: 15px; color: #666666; line-height: 1.6; margin-bottom: 30px; }
        
        /* Signature Styling */
        .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { 
            margin-top: 20px; 
            font-style: italic; 
            color: #0EBE3C; 
            font-weight: 600; 
            border-top: 1px solid #eee; 
            padding-top: 15px; 
        }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <h1 class="title">${subject}</h1>
                <div class="description-box">
                    <p class="description">${description}</p>
                </div>
                <p class="info-text">
                    You are receiving this email because you are a valued partner of <strong>Bins App</strong>.
                    Please find the important documents attached to this message.
                </p>
            </div>
             <div class="sig-footer">
            <div class="sig-name">John Zaloum</div>
            <div class="sig-title">Founder/CEO — BINS APP CORP</div>
            
            <div class="sig-details">
                <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
                <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
            </div>

            <div class="tagline">
                "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
            </div>
            
            <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
                As Featured in <em>Waste Advantage Magazine</em>
            </p>
        </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>

`;
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

  // Email data
  const mailOptions = {
    from: "info@binsapp.ai",
    to: email, // Replace with the recipient's email address
    subject: subject,
    html: html ? description : htmlTemplate,
    attachments: html ? [] : attachments,
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error("Error sending email: ", error);
    } else {
      logger.info("Email sent: " + info.response);
    }
  });
};

export const sendOrderEmailToUser = async (
  email,
  orderId,
  address,
  price,
  name,
  phone,
  rentee,
) => {
  const link = rentee
    ? `https://api.binsapp.ai/owner-orders?orderId=${orderId}`
    : `https://api.binsapp.ai/customer-orders?orderId=${orderId}`;
  const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Completed</title>
    <style>
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0; padding: 0;
            background-color: #f4f7f6;
            color: #333333;
        }
        .wrapper { width: 100%; padding: 40px 0; background-color: #f4f7f6; }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .header { padding: 30px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .success-icon { color: #0EBE3C; font-size: 48px; margin-bottom: 10px; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 20px; }
        
        /* Order Card */
        .order-card {
            background-color: #fafafa;
            border: 1px solid #eeeeee;
            border-radius: 10px;
            padding: 20px;
            text-align: left;
            margin-bottom: 25px;
        }
        .section-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #0EBE3C;
            font-weight: bold;
            margin-bottom: 10px;
            border-bottom: 1px solid #eef0ef;
            padding-bottom: 5px;
        }
        .detail-item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
        .price-tag { font-size: 18px; font-weight: bold; color: #1a1a1a; }

        /* Buttons */
        .btn-container { margin: 30px 0; text-align: center; }
        .primary-btn {
            background-color: #0EBE3C;
            color: #ffffff !important;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            display: inline-block;
            font-size: 16px;
        }
        .secondary-link {
            display: block;
            margin-top: 15px;
            color: #0c64c0;
            text-decoration: none;
            font-size: 14px;
        }

        /* Signature Block (Matching Image) */
        .sig-footer {
            text-align: left;
            border-top: 1px solid #eee;
            padding: 30px 0 0;
            margin-top: 20px;
        }
        .sig-name { font-size: 20px; font-weight: 800; color: #000000; margin-bottom: 5px; }
        .sig-title { font-size: 15px; color: #0EBE3C; font-weight: 700; margin-bottom: 15px; }
        .sig-details { font-size: 14px; color: #555; line-height: 1.8; margin-bottom: 20px; }
        .sig-details strong { color: #444; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: 600; }
        
        .tagline-italic { font-size: 15px; font-style: italic; color: #0EBE3C; font-weight: 500; margin-top: 20px; }
        .tagline-bold { font-size: 16px; color: #0c64c0; font-weight: bold; margin-top: 4px; }
        .featured-text { font-size: 12px; color: #999; margin-top: 15px; }
        
        .footer-copy { text-align: center; padding: 20px; font-size: 12px; color: #bbb; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
                <div class="success-icon">✓</div>
            </div>

            <div class="content">
                <h1 class="title">Order Completed!</h1>
                
                <div class="order-card">
                    <div class="section-label">Order Details</div>
                    <div class="detail-item"><strong>Order ID:</strong> <span>#${orderId}</span></div>
                    <div class="detail-item"><strong>Address:</strong> <span>${address}</span></div>
                    <div class="detail-item"><strong>Total Price:</strong> <span class="price-tag">$${price}</span></div>
                    
                    <div class="section-label" style="margin-top: 15px;">
                        ${rentee ? "Rentee Detail" : "Renter Detail"}
                    </div>
                    <div class="detail-item"><strong>Name:</strong> <span>${name}</span></div>
                    <div class="detail-item"><strong>Phone:</strong> <span>${phone}</span></div>
                </div>

                <div class="btn-container">
                    <a href="${link}" class="primary-btn">View Order in BINS APP</a>
                </div>

                <div class="sig-footer">
                    <div class="sig-name">John Zaloum</div>
                    <div class="sig-title">FOUNDER/CEO — BINS APP CORP</div>
                    
                    <div class="sig-details">
                        <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                        <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                        <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
                        <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
                    </div>

                    <div class="tagline-italic">
                        "Trash to scrap, get a dumpster in a snap, just tap that APP!"
                    </div>
                    <div class="tagline-bold">
                        Join the Waste Revolution™ — TAP-Toss-Done
                    </div>
                    
                    <p class="featured-text">
                        As Featured in <em>Waste Advantage Magazine</em>
                    </p>
                </div>
            </div>

            <div class="footer-copy">
                &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
            </div>
        </div>
    </div>
</body>
</html>`;

  // Email data
  const mailOptions = {
    from: "info@binsapp.ai",
    to: email, // Replace with the recipient's email address
    subject: "Order Completed",
    html: htmlTemplate,
    attachments: [
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
    ],
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error("Error sending email: ", error);
    } else {
      logger.info("Email sent: " + info.response);
    }
  });
};

export const deleteUserEmail = async (email, deleteLink) => {
  // Create a Nodemailer transporter object

  const mailOptions = {
    from: "info@binsapp.ai",
    to: email,
    subject: "BINS APP CORP - Confirm Your Account Deletion",
    text: `
               Dear BINS APP CORP User,
               
               We received a request to permanently delete your BINS APP CORP account. If you did not make this request, please ignore this email.
               
               To proceed with the deletion of your account and all associated data, please click the link below:
               
               Delete My Account: ${deleteLink}
               
               Please note that once you confirm the deletion, this action cannot be undone, and all your data will be permanently removed from our system.
               
               If you have any questions or concerns, feel free to contact our support team.
               
               Thank you for using BINS APP CORP.
               
               Best regards,
               The BINS APP CORP Team
          `,
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error("Error sending email: ", error);
    } else {
      logger.info("Email sent: " + info.response);
    }
  });
};
