/**
 * Renders real invoices (orders & commercial billing records) with the invoice template
 * the admin marked as default in Admin → Templates → Invoices. Every surface (admin
 * payments, admin company billing, provider order invoice, builder billing) goes through
 * here so they all print the same admin-selected design.
 */
import templateService from "../modules/template/service.js";
import { renderTemplateString } from "./templateEngine.js";

const PLATFORM = {
  companyName: "BINS APP CORP",
  companyAddress: "Orlando, FL 32801",
  companyEmail: "info@binsapp.ai",
  companyPhone: "(407) 250-5860",
  logoUrl:
    "https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg",
};

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const money = (v) =>
  `$${num(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const nice = (s) =>
  String(s || "")
    .replace(/^Dumbster$/i, "Dumpster")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Escape every string value (templates insert values raw). Arrays of objects too. */
function escapeData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      out[k] = v.map((row) =>
        row && typeof row === "object"
          ? Object.fromEntries(Object.entries(row).map(([rk, rv]) => [rk, esc(rv)]))
          : esc(row),
      );
    } else if (k === "logoUrl") {
      out[k] = /^https?:\/\//i.test(String(v || "")) ? esc(v) : "";
    } else {
      out[k] = v == null ? "" : esc(v);
    }
  }
  return out;
}

const personName = (p) => (p && typeof p === "object" ? p.comp_name || p.name || "" : "");

export function orderNumberOf(order) {
  return order?.orderNumber || `ORD-${String(order?._id || "").slice(-6).toUpperCase()}`;
}

/**
 * Payment status of an order — identical rules to the admin Payments ledger
 * (admin/service.js calculateOrderFinancials) so the invoice never disagrees with the table.
 */
export function paymentStatusOf(order) {
  if (order.refunded || order.status === "cancelled") {
    return { key: "refunded", label: "Refunded", hint: "This payment was refunded to the customer." };
  }
  if (order.status === "completed") {
    return order.transfer
      ? { key: "released", label: "Paid", hint: "" }
      : { key: "on_hold", label: "On Hold", hint: "Job completed — payment held in escrow until release." };
  }
  return { key: "in_process", label: "In Process", hint: "Service in progress — payment held in escrow." };
}

const TONE = {
  paid: { color: "#16a34a", bg: "#dcfce7" },
  held: { color: "#2563eb", bg: "#dbeafe" },
  due: { color: "#d97706", bg: "#fef3c7" },
  overdue: { color: "#dc2626", bg: "#fee2e2" },
  refunded: { color: "#dc2626", bg: "#fee2e2" },
  void: { color: "#64748b", bg: "#f1f5f9" },
};

/**
 * Everything an invoice shows about money for one order, by payment status.
 *   released          → Paid in full
 *   in_process/on_hold → card/wallet: paid, held in escrow · invoice terms: balance due
 *   refunded          → cancelled/refunded: Paid X, Refunded −X, balance 0 (matches the Payments table)
 */
function orderMoney(order, total, method, dueDate) {
  const pay = paymentStatusOf(order);
  // Card / wallet payments are captured up front; invoice-terms orders aren't collected until release.
  const charged = method !== "invoice" || Boolean(order.paymentId);
  const T = (k) => ({ statusColor: TONE[k].color, statusBg: TONE[k].bg });

  // Cancelled / refunded orders always read "Refunded" — same as the admin Payments table.
  if (pay.key === "refunded") {
    return {
      ...T("refunded"), key: "refunded", status: "Refunded", paidLabel: "Paid", amountPaid: total, refunded: total, balanceDue: 0,
      headlineLabel: "Refunded to customer", headlineAmount: total,
      statusNote: `The full payment of ${money(total)} was refunded to the customer.`,
    };
  }
  if (pay.key === "released") {
    return {
      ...T("paid"), key: "released", status: "Paid", paidLabel: "Paid", amountPaid: total, refunded: 0, balanceDue: 0,
      headlineLabel: "Paid in full", headlineAmount: total, statusNote: "",
    };
  }
  const stage = pay.key === "on_hold" ? "Job completed" : "Service in progress";
  if (charged) {
    return {
      ...T("held"), key: pay.key, status: pay.label, paidLabel: "Paid — held in escrow", amountPaid: total, refunded: 0, balanceDue: 0,
      headlineLabel: `Paid — held in escrow (${stage.toLowerCase()})`, headlineAmount: total,
      statusNote: `${stage}. Payment is held securely in escrow and released to the provider when the job is closed.`,
    };
  }
  return {
    ...T("due"), key: pay.key, status: pay.label, paidLabel: "Paid", amountPaid: 0, refunded: 0, balanceDue: total,
    headlineLabel: dueDate ? `Balance due by ${dueDate}` : "Balance due", headlineAmount: total,
    statusNote: `${stage}. Payment is due on your invoice terms.`,
  };
}

/** Same for a commercial billing record (open / due / partial / paid / void). */
function billingMoney(record, total, dueDate) {
  const T = (k) => ({ statusColor: TONE[k].color, statusBg: TONE[k].bg });
  const st = String(record.status || "open").toLowerCase();
  if (st === "void") {
    return {
      ...T("void"), status: "Void", paidLabel: "Paid", amountPaid: 0, refunded: 0, balanceDue: 0,
      headlineLabel: "Void — nothing to pay", headlineAmount: 0, statusNote: "This invoice was voided.",
    };
  }
  if (st === "paid") {
    return {
      ...T("paid"), status: "Paid", paidLabel: "Paid", amountPaid: total, refunded: 0, balanceDue: 0,
      headlineLabel: record.paidAt ? `Paid in full on ${fmtDate(record.paidAt)}` : "Paid in full", headlineAmount: total,
      statusNote: "",
    };
  }
  const paid = Math.min(total, num(record.paidAmount));
  const balance = Math.max(0, total - paid);
  const overdue = record.dueDate && new Date(record.dueDate).getTime() < Date.now();
  const tone = overdue ? "overdue" : "due";
  return {
    ...T(tone),
    status: overdue ? "Overdue" : paid > 0 ? "Partially paid" : st === "due" ? "Due" : "Open",
    paidLabel: "Paid", amountPaid: paid, refunded: 0, balanceDue: balance,
    headlineLabel: overdue ? `Overdue — was due ${dueDate}` : dueDate ? `Balance due by ${dueDate}` : "Balance due",
    headlineAmount: balance,
    statusNote: paid > 0 ? `${money(paid)} received so far — ${money(balance)} remaining.` : "",
  };
}

/** Money fields shared by both invoice kinds. */
const moneyVars = (m) => ({
  status: m.status,
  amountPaid: money(m.amountPaid),
  balanceDue: money(m.balanceDue),
  refundedAmount: m.refunded > 0 ? money(m.refunded) : "",
  paidLabel: m.paidLabel,
  headlineLabel: m.headlineLabel,
  headlineAmount: money(m.headlineAmount),
  statusNote: m.statusNote,
  statusColor: m.statusColor,
  statusBg: m.statusBg,
});

/** Template variables for a customer order. docType: "invoice" | "receipt". */
export function buildOrderInvoiceData(order, { docType = "invoice" } = {}) {
  const orderNo = orderNumberOf(order);
  const tag = String(orderNo).replace(/[^A-Za-z0-9]/g, "");
  const customer = order.user && typeof order.user === "object" ? order.user : {};
  const company = order.company && typeof order.company === "object" ? order.company : null;
  const provider = order.to_id && typeof order.to_id === "object" ? order.to_id : {};

  const surcharges = (order.surcharges || []).filter((s) => s && s.status !== "waived");
  const surchargeTotal =
    num(order.totalSurcharges) || surcharges.reduce((a, s) => a + num(s.amount), 0);
  const overage = num(order.overageAmount);
  const extra = num(order.extra);

  // Add-ons charged at checkout (same figures the admin Payments ledger uses).
  const addons = [
    order.driveaway ? { description: "Driveway protection", amount: 50 } : null,
    order.cancelation ? { description: "Cancellation protection", amount: 39 } : null,
  ].filter(Boolean);
  const addonTotal = addons.reduce((a, x) => a + x.amount, 0);
  const components = surchargeTotal + overage + extra + addonTotal;

  // `price` is what the customer was charged (the ledger's "Customer Paid").
  const price = num(order.price);
  let base = price > components ? price - components : num(order.amount) || price;

  const sizeLabel = order.dustbin?.size ? `${order.dustbin.size} Yard ` : "";
  const service = nice(order.service_type || "Dumpster");
  const days = num(order.num_days);
  const qty = Math.max(1, num(order.quantity) || 1);

  const items = [
    {
      description: `${sizeLabel}${service}${days ? ` — ${days} day rental` : ""}`,
      quantity: String(qty),
      unitPrice: money(base / qty),
      amount: money(base),
    },
  ];
  if (extra > 0) items.push({ description: "Extra days", quantity: "1", unitPrice: money(extra), amount: money(extra) });
  if (overage > 0) {
    const tons = num(order.overageTons);
    items.push({
      description: `Weight overage${tons ? ` (${tons} t)` : ""}`,
      quantity: tons ? String(tons) : "1",
      unitPrice: money(num(order.overagePerTon) || overage),
      amount: money(overage),
    });
  }
  for (const s of surcharges) {
    items.push({
      description: s.title || nice(s.type) || "Surcharge",
      quantity: "1",
      unitPrice: money(s.amount),
      amount: money(s.amount),
    });
  }

  for (const a of addons) {
    items.push({ description: a.description, quantity: "1", unitPrice: money(a.amount), amount: money(a.amount) });
  }

  const total = base + components;
  const method = String(order.payment_type || "stripe").toLowerCase();
  const dueDate = fmtDate(order.start_date || order.createdAt);
  const m = orderMoney(order, total, method, dueDate);

  return {
    ...PLATFORM,
    invoiceNumber: docType === "receipt" ? `REC-${tag}` : `INV-${tag}`,
    issueDate: fmtDate(order.createdAt || new Date()),
    dueDate,
    paymentStatusKey: m.key,
    customerName: company?.companyName || personName(customer) || "Customer",
    customerEmail: company?.email || customer.email || "",
    customerPhone: company?.phone || customer.phone || "",
    customerAddress: company?.address || order.address || "",
    orderNumber: orderNo,
    serviceAddress: order.address || "",
    items,
    subtotal: money(total),
    taxRate: "0%",
    tax: money(0),
    discount: "",
    total: money(total),
    ...moneyVars(m),
    paymentMethod:
      method === "invoice" ? "Invoice (net terms)" : method === "wallet" ? "BINS Wallet" : "Card (Stripe)",
    notes: [
      provider && personName(provider) ? `Service provider: ${personName(provider)}` : "",
      "Thank you for choosing BINS APP.",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

/** Template variables for a commercial BillingRecord. */
export function buildBillingInvoiceData(record) {
  const company = record.company && typeof record.company === "object" ? record.company : {};
  const user = record.user && typeof record.user === "object" ? record.user : {};
  const order = record.order && typeof record.order === "object" ? record.order : null;
  const lines = (record.lineItems || []).length
    ? record.lineItems
    : [{ description: "Services", amount: record.amount }];

  const items = lines.map((li) => ({
    description: li.description || nice(li.type) || "Line item",
    quantity: "1",
    unitPrice: money(li.amount),
    amount: money(li.amount),
  }));
  const total = num(record.amount) || lines.reduce((a, li) => a + num(li.amount), 0);
  const method = String(record.metadata?.paymentMethod || "").toLowerCase();
  const dueDate = fmtDate(record.dueDate);
  const m = billingMoney(record, total, dueDate);

  return {
    ...PLATFORM,
    invoiceNumber: record.invoiceNumber || `INV-${String(record._id).slice(-6).toUpperCase()}`,
    issueDate: fmtDate(record.createdAt),
    dueDate,
    customerName: company.companyName || company.legalBusinessName || personName(user) || "Customer",
    customerEmail: company.email || user.email || "",
    customerPhone: company.phone || user.phone || "",
    customerAddress: [company.address, company.city, company.state, company.zip].filter(Boolean).join(", "),
    orderNumber: order ? orderNumberOf(order) : record.metadata?.offerTitle || "",
    serviceAddress: order?.address || record.metadata?.jobsites?.[0]?.siteName || "",
    items,
    subtotal: money(total),
    taxRate: "0%",
    tax: money(0),
    discount: "",
    total: money(total),
    ...moneyVars(m),
    paymentMethod: method === "card" ? "Card" : "Invoice (net terms)",
    notes: record.notes || "Thank you for your business.",
  };
}

/** Use the same typeface as the admin & web apps (Geist) in every invoice. */
const APP_FONT_TAGS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet" crossorigin="anonymous" />
<style>html,body,table,td,th,div,span,p,h1,h2,h3,h4,b,strong{font-family:'Geist',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif !important}
img{max-width:100%}
/* Phones: invoice fills the screen, side-by-side boxes stack, nothing gets cut off. */
@media (max-width:640px){
  body{padding:0 !important;background:#fff !important;font-size:13px !important}
  .sheet{max-width:none !important;width:100% !important;border-radius:0 !important;box-shadow:none !important;border-left:0 !important;border-right:0 !important}
  .sheet,.body,.band,.amount,.foot{padding-left:16px !important;padding-right:16px !important}
  .sheet{padding-top:16px !important;padding-bottom:16px !important}
  .band,.amount{padding-top:16px !important;padding-bottom:16px !important}
  .band,.grid,.row,.two,.top,.boxes{flex-direction:column !important;align-items:stretch !important;gap:10px !important}
  .band .right,.row .right{text-align:left !important}
  .boxes>div{border-right:0 !important;border-bottom:1px solid #cbd5e1}
  .boxes>div:last-child{border-bottom:0}
  .amount b{font-size:22px !important}
  h1{font-size:22px !important}
  .totals{width:100% !important;margin-left:0 !important}
  .items th,.items td{padding-left:4px !important;padding-right:4px !important;font-size:12px}
  .items th:first-child,.items td:first-child{padding-left:0 !important}
}</style>`;

function withAppFont(html) {
  if (!html) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${APP_FONT_TAGS}\n</head>`);
  return `${APP_FONT_TAGS}\n${html}`;
}

/** Render with the admin's default invoice template. */
let designsSynced = null;

export async function renderInvoice(data) {
  // Once per server start: refresh un-edited built-in designs from code (admin-edited ones
  // are left alone), so layout fixes reach invoices without a manual "sync".
  if (!designsSynced) designsSynced = templateService.syncSystemTemplates().catch(() => null);
  await designsSynced;
  const template = await templateService.getDefaultInvoice();
  const source = template?.html || template?.description || "";
  const safe = escapeData(data);
  return {
    html: withAppFont(renderTemplateString(source, { year: new Date().getFullYear(), ...safe })),
    subject: renderTemplateString(template?.subject || "Invoice {{invoiceNumber}}", safe),
    invoiceNumber: data.invoiceNumber,
    template: template ? { _id: template._id, title: template.title, key: template.key } : null,
  };
}
