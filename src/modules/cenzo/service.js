import nodemailer from "nodemailer";
import CenzoInquiry from "../../models/CenzoInquiry.js";
import logger from "../../config/logger.js";
import {
  buildCenzoAdminNotificationEmail,
  buildCenzoConfirmationEmail,
} from "./templates/cenzoEmailTemplates.js";

// Reusable Nodemailer transporter for Cenzo emails
const transporter = nodemailer.createTransport({
  host: process.env.CENZO_SMTP_HOST || "mail.binsapp.ai",
  port: Number(process.env.CENZO_SMTP_PORT) || 587,
  secure: false,
  pool: true,
  maxConnections: 2,
  rateLimit: 5,
  auth: {
    user: process.env.CENZO_SMTP_USER || "info@binsapp.ai",
    pass: process.env.CENZO_SMTP_PASS || "I7;jnC3s&,q-",
  },
  tls: {
    rejectUnauthorized: false,
  },
});

class CenzoService {
  /**
   * Submit a new inquiry from the Cenzo contact form
   */
  async submitInquiry(payload, reqMeta = {}) {
    // Normalization of field names to support varied frontend field names
    const fullName = (payload.fullName || payload.name || "").trim();
    const company = (payload.company || payload.companyName || payload.organization || "").trim();
    const email = (payload.email || payload.emailAddress || "").trim().toLowerCase();
    const phone = (payload.phone || payload.phoneNumber || "").trim();
    const inquiryType = (payload.inquiryType || payload.type || payload.role || payload.iAmA || "General Inquiry").trim();
    const projectLocation = (payload.projectLocation || payload.location || payload.propertyLocation || "").trim();
    const heardAbout = (payload.heardAbout || payload.source || payload.howDidYouHear || "").trim();
    const message = (payload.message || payload.comments || payload.opportunityDetails || payload.notes || "").trim();

    // Validation
    if (!fullName) {
      throw new Error("Full name is required.");
    }
    if (!email) {
      throw new Error("Email address is required.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Please provide a valid email address.");
    }
    if (!phone) {
      throw new Error("Phone number is required.");
    }

    // Create DB Record
    const inquiry = new CenzoInquiry({
      fullName,
      company,
      email,
      phone,
      inquiryType,
      projectLocation,
      heardAbout,
      message,
      metadata: {
        ip: reqMeta.ip || "",
        userAgent: reqMeta.userAgent || "",
        origin: reqMeta.origin || "",
        referer: reqMeta.referer || "",
      },
    });

    await inquiry.save();

    // Email Configuration
    const adminRecipient = process.env.CENZO_ADMIN_EMAIL || "john@cenzoredev.com";
    const ccRecipient = process.env.CENZO_CC_EMAIL || null;
    const fromAddress = process.env.CENZO_FROM_EMAIL
      ? `"${process.env.CENZO_FROM_NAME || "Cenzo R.E. Developments"}" <${process.env.CENZO_FROM_EMAIL}>`
      : '"Cenzo R.E. Developments" <info@binsapp.ai>';

    // 1. Send Admin Notification Email to Cenzo
    try {
      const refCode = inquiry._id ? inquiry._id.toString().slice(-6).toUpperCase() : "NEW";
      const adminHtml = buildCenzoAdminNotificationEmail(inquiry);
      const adminSubject = `[Opportunity Dossier #${refCode}] ${inquiryType} - ${fullName}`;

      const adminMailOptions = {
        from: fromAddress,
        to: adminRecipient,
        replyTo: `"${fullName}" <${email}>`,
        subject: adminSubject,
        html: adminHtml,
        text: `New Opportunity Inquiry for Cenzo R.E. Developments [Ref: #${refCode}]\n\nName: ${fullName}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone}\nInquiry Type: ${inquiryType}\nLocation: ${projectLocation}\nReferral: ${heardAbout}\n\nDetails:\n${message}`,
      };

      if (ccRecipient) {
        adminMailOptions.cc = ccRecipient;
      }

      await transporter.sendMail(adminMailOptions);
      inquiry.adminEmailSent = true;
      logger.info(`✅ Cenzo admin notification email sent to ${adminRecipient} for inquiry ${inquiry._id}`);
    } catch (err) {
      logger.error("❌ Failed to send Cenzo admin notification email:", err);
      inquiry.emailErrors.push(`Admin email error: ${err.message}`);
    }

    // 2. Send Submitter Auto-Confirmation Email (unless explicitly skipped)
    const sendConfirmation = payload.sendConfirmationEmail !== false;
    if (sendConfirmation) {
      try {
        const refCode = inquiry._id ? inquiry._id.toString().slice(-6).toUpperCase() : "CONFIRMED";
        const clientHtml = buildCenzoConfirmationEmail(inquiry);
        const clientSubject = `Congratulations ${fullName}! Inquiry Received [#${refCode}] | Cenzo R.E. Developments`;

        const clientMailOptions = {
          from: fromAddress,
          to: email,
          replyTo: "john@cenzoredev.com",
          subject: clientSubject,
          html: clientHtml,
          text: `Congratulations ${fullName}!\n\nThank you for reaching out to Cenzo R.E. Developments. We have received your opportunity inquiry regarding ${inquiryType} [Ref: #${refCode}].\n\nDeveloper John Zaloum personally reviews every inquiry. Our team will review your project details and respond directly within 24 to 48 business hours.\n\nDirect Developer Access:\nJohn Zaloum • Cenzo R.E. Developments\nOrlando, Florida\nOffice: (407) 258-5860 | Cell: (989) 578-0202\nEmail: john@cenzoredev.com`,
        };

        await transporter.sendMail(clientMailOptions);
        inquiry.clientEmailSent = true;
        logger.info(`✅ Cenzo confirmation email sent to applicant ${email} for inquiry ${inquiry._id}`);
      } catch (err) {
        logger.error("❌ Failed to send Cenzo confirmation email to applicant:", err);
        inquiry.emailErrors.push(`Applicant confirmation email error: ${err.message}`);
      }
    }

    // Save final status flags
    await inquiry.save();

    return inquiry;
  }

  /**
   * List inquiries with pagination & status filter (for admin use)
   */
  async listInquiries({ page = 1, limit = 20, status = null, search = "" } = {}) {
    const query = {};
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { projectLocation: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      CenzoInquiry.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      CenzoInquiry.countDocuments(query),
    ]);

    return {
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  }

  /**
   * Get single inquiry by ID
   */
  async getInquiryById(id) {
    const inquiry = await CenzoInquiry.findById(id).lean();
    if (!inquiry) {
      throw new Error("Inquiry not found.");
    }
    return inquiry;
  }

  /**
   * Update inquiry status
   */
  async updateStatus(id, status) {
    const validStatuses = ["new", "reviewed", "contacted", "archived"];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }
    const inquiry = await CenzoInquiry.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    );
    if (!inquiry) {
      throw new Error("Inquiry not found.");
    }
    return inquiry;
  }
}

export default new CenzoService();

