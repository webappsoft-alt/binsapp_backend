import BillingRecord from "../models/BillingRecord.js";
import Company from "../models/Company.js";
import { notifyCommercialParties } from "./commercialNotify.js";
import { generateOTP } from "./Generator.js";
import logger from "../config/logger.js";

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d;
}

export async function createOrAppendInvoiceLine({
  companyId,
  userId,
  orderId,
  amount,
  type = "order",
  description = "",
  metadata = {},
  notify = true,
}) {
  const company = await Company.findById(companyId).lean();
  if (!company) {
    throw new Error("Company not found for invoice line");
  }

  const netDays = Number(company.invoiceTerms?.netDays) || 30;
  let record = await BillingRecord.findOne({
    company: companyId,
    order: orderId,
    status: { $in: ["open", "due", "partial"] },
  });

  const line = {
    type,
    description,
    amount: Number(amount) || 0,
    order: orderId || null,
    metadata,
    createdAt: new Date(),
  };

  if (!record) {
    const invoiceNumber = `INV-${generateOTP(8, { alphabet: true, numeric: true })}`;
    record = await BillingRecord.create({
      company: companyId,
      user: userId,
      order: orderId || null,
      invoiceNumber,
      status: "open",
      amount: line.amount,
      dueDate: addDays(new Date(), netDays),
      lineItems: [line],
      metadata: { paymentMethod: "invoice" },
    });

    if (notify) {
      notifyCommercialParties({
        actorId: userId,
        customer: { _id: userId, email: company.accountsPayableEmail },
        type: "invoice_created",
        title: "Invoice created",
        description: `Invoice ${invoiceNumber} for $${line.amount.toFixed(2)} was created.`,
        orderId: orderId?.toString?.() || orderId,
        customerLink: `https://api.binsapp.ai/company-billing?invoiceId=${record._id}`,
        metadata: {
          action: "invoice_created",
          invoiceId: record._id.toString(),
          invoiceNumber,
        },
      }).catch((err) => logger.error("invoice_created notify failed", err));
    }
  } else {
    record.lineItems.push(line);
    record.amount = (Number(record.amount) || 0) + line.amount;
    await record.save();
  }

  return record;
}

export async function accruePerDiemToInvoice({
  companyId,
  userId,
  orderId,
  amount,
  dayprice,
  extra,
}) {
  return createOrAppendInvoiceLine({
    companyId,
    userId,
    orderId,
    amount,
    type: "per_diem",
    description: `Daily overdue per-diem charge ($${dayprice})`,
    metadata: { dayprice, extra, action: "per_diem_accrual" },
    notify: false,
  });
}

export async function billOverageToInvoice({
  companyId,
  userId,
  orderId,
  amount,
  overageTons,
}) {
  return createOrAppendInvoiceLine({
    companyId,
    userId,
    orderId,
    amount,
    type: "overage",
    description: `Tonnage overage (${overageTons} tons)`,
    metadata: { overageTons, action: "overage_billed" },
    notify: true,
  });
}
