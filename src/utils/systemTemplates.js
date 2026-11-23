import { EMAIL_TEMPLATE_DEFAULTS as D } from "./emailTemplate.js";
import { partnerUpdateEmailHtml, orderCompletedEmailHtml } from "./emailservice.js";

/**
 * Templates that live in backend code. They're seeded into the Template collection
 * (kind: "system") so admins can view and edit them in the Templates page. Each default
 * is built by calling the code builder with "{{variable}}" placeholders, so the stored
 * copy keeps the same layout and the override engine can fill real values in later.
 */
const ph = (name) => `{{${name}}}`;

export const SYSTEM_EMAIL_TEMPLATES = [
  {
    key: "partner_update",
    title: "Partner update (admin message)",
    group: "Admin & broadcasts",
    subject: "{{subject}}",
    summary: "Default branded email for admin notifications, support replies and system messages.",
    variables: [
      { name: "subject", label: "Headline / subject", sample: "Your account was approved" },
      { name: "description", label: "Message", sample: "You can now start receiving orders." },
    ],
    build: () => partnerUpdateEmailHtml(ph("subject"), ph("description")),
  },
  {
    key: "order_completed",
    title: "Order completed",
    group: "Orders",
    subject: "Order Completed",
    subjectEditable: false,
    summary: "Sent to both parties when an order is marked complete.",
    variables: [
      { name: "orderId", label: "Order ID", sample: "ORD-10293" },
      { name: "address", label: "Address", sample: "120 Main St, Orlando, FL" },
      { name: "price", label: "Total price", sample: "349.00" },
      { name: "name", label: "Other party name", sample: "Jordan Lee" },
      { name: "phone", label: "Other party phone", sample: "(407) 555-0144" },
      { name: "partyLabel", label: "Party label", sample: "Renter Detail" },
      { name: "link", label: "Order link", sample: "https://binsapp.ai/orders/10293" },
    ],
    build: () =>
      orderCompletedEmailHtml({
        orderId: ph("orderId"),
        address: ph("address"),
        price: ph("price"),
        name: ph("name"),
        phone: ph("phone"),
        rentee: false,
        link: ph("link"),
      }).replace("Renter Detail", ph("partyLabel")),
  },
  {
    key: "order_update_button",
    title: "Order update (call to action)",
    group: "Orders",
    subject: "{{title}}",
    subjectEditable: false,
    summary: "Generic order / dispatch / growth update with a button into the app.",
    variables: [
      { name: "title", label: "Title", sample: "New order offer" },
      { name: "description", label: "Description", sample: "A customer request is available in your area." },
      { name: "orderLink", label: "Button link", sample: "https://binsapp.ai/orders/10293" },
    ],
    build: () => D.buttonTemplateDefault(ph("orderLink"), ph("title"), ph("description")),
  },
  {
    key: "order_change_offer",
    title: "Order change offer",
    group: "Orders",
    subject: "Order change offer",
    subjectEditable: false,
    summary: "Sent when the other party proposes a change to an order.",
    variables: [{ name: "orderLink", label: "Order link", sample: "https://binsapp.ai/orders/10293" }],
    build: () => D.orderChangeOfferTemplateDefault(ph("orderLink")),
  },
  {
    key: "offer_accepted",
    title: "Offer accepted / completed",
    group: "Orders",
    subject: "Your offer has been completed",
    subjectEditable: false,
    summary: "Confirms an accepted or completed offer.",
    variables: [{ name: "orderLink", label: "Order link", sample: "https://binsapp.ai/orders/10293" }],
    build: () => D.offerAcceptedTemplateDefault(ph("orderLink")),
  },
  {
    key: "order_assigned_driver",
    title: "Order assigned to driver",
    group: "Dispatch",
    subject: "New order assigned",
    subjectEditable: false,
    summary: "Sent to a driver when a job is dispatched to them.",
    variables: [
      { name: "driverName", label: "Driver name", sample: "Sam" },
      { name: "orderNumber", label: "Order number", sample: "10293" },
      { name: "serviceType", label: "Service", sample: "20 Yard Dumpster" },
      { name: "address", label: "Address", sample: "120 Main St, Orlando, FL" },
      { name: "deliveryDate", label: "Delivery date", sample: "Nov 22, 2026" },
      { name: "assignLink", label: "Job link", sample: "https://binsapp.ai/driver/jobs/10293" },
    ],
    build: () =>
      D.orderAssignedDriverTemplateDefault({
        assignLink: ph("assignLink"),
        driverName: ph("driverName"),
        orderNumber: ph("orderNumber"),
        serviceType: ph("serviceType"),
        address: ph("address"),
        deliveryDate: ph("deliveryDate"),
      }),
  },
  {
    key: "rating_received",
    title: "New rating received",
    group: "Reviews",
    subject: "You received a new rating",
    subjectEditable: false,
    summary: "Tells a provider a customer rated their order.",
    variables: [
      { name: "customerName", label: "Customer name", sample: "Jordan Lee" },
      { name: "stars", label: "Star string", sample: "★★★★☆" },
      { name: "rating", label: "Rating (number)", sample: "4" },
      { name: "orderLink", label: "Order link", sample: "https://binsapp.ai/orders/10293" },
    ],
    build: () => D.ratingEmailTemplateDefault(ph("orderLink"), 5, ph("customerName")).split("★★★★★").join(ph("stars")),
  },
  {
    key: "service_pending_review",
    title: "Service application under review",
    group: "Partner onboarding",
    subject: "Your application is under review",
    subjectEditable: false,
    summary: "Sent when a provider submits a service for approval.",
    variables: [
      { name: "userName", label: "Partner name", sample: "Jordan" },
      { name: "serviceLabel", label: "Service", sample: "Junk Removal" },
    ],
    build: () => D.servicePendingReviewTemplateDefault(ph("userName"), ph("serviceLabel")),
  },
  {
    key: "service_approved",
    title: "Service application approved",
    group: "Partner onboarding",
    subject: "You're approved",
    subjectEditable: false,
    summary: "Sent when an admin approves a provider's service.",
    variables: [
      { name: "userName", label: "Partner name", sample: "Jordan" },
      { name: "serviceLabel", label: "Service", sample: "Junk Removal" },
    ],
    build: () => D.serviceApprovedTemplateDefault(ph("userName"), ph("serviceLabel")),
  },
  {
    key: "service_rejected",
    title: "Service application rejected",
    group: "Partner onboarding",
    subject: "Update on your application",
    subjectEditable: false,
    summary: "Sent when an admin rejects a provider's service, with notes.",
    variables: [
      { name: "userName", label: "Partner name", sample: "Jordan" },
      { name: "serviceLabel", label: "Service", sample: "Junk Removal" },
      { name: "notes", label: "Rejection notes", sample: "Please upload a valid insurance certificate." },
    ],
    build: () => D.serviceRejectedTemplateDefault(ph("userName"), ph("notes"), ph("serviceLabel")),
  },
];

/* ------------------------------------------------------------------ invoices */

export const INVOICE_VARIABLES = [
  { name: "companyName", label: "Company name", sample: "BINS APP CORP" },
  { name: "companyAddress", label: "Company address", sample: "Orlando, FL 32801" },
  { name: "companyEmail", label: "Company email", sample: "info@binsapp.ai" },
  { name: "companyPhone", label: "Company phone", sample: "(407) 250-5860" },
  { name: "logoUrl", label: "Logo URL", sample: "https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" },
  { name: "invoiceNumber", label: "Invoice number", sample: "INV-2026-0142" },
  { name: "issueDate", label: "Issue date", sample: "Nov 20, 2026" },
  { name: "dueDate", label: "Due date", sample: "Dec 4, 2026" },
  { name: "status", label: "Status", sample: "Due" },
  { name: "customerName", label: "Bill to — name", sample: "Acme Builders LLC" },
  { name: "customerEmail", label: "Bill to — email", sample: "ap@acmebuilders.com" },
  { name: "customerPhone", label: "Bill to — phone", sample: "(321) 555-0199" },
  { name: "customerAddress", label: "Bill to — address", sample: "88 Industrial Way, Tampa, FL" },
  { name: "orderNumber", label: "Order number", sample: "ORD-10293" },
  { name: "serviceAddress", label: "Service address", sample: "120 Main St, Orlando, FL" },
  { name: "items", label: "Line items (list: description, quantity, unitPrice, amount)", sample: "" },
  { name: "subtotal", label: "Subtotal", sample: "$695.00" },
  { name: "taxRate", label: "Tax rate", sample: "6.5%" },
  { name: "tax", label: "Tax", sample: "$45.18" },
  { name: "discount", label: "Discount", sample: "$0.00" },
  { name: "total", label: "Total", sample: "$740.18" },
  { name: "amountPaid", label: "Amount paid", sample: "$200.00" },
  { name: "balanceDue", label: "Balance due", sample: "$540.18" },
  { name: "headlineLabel", label: "Status headline (e.g. Balance due by …, Paid in full, Refunded)", sample: "Balance due by Dec 4, 2026" },
  { name: "headlineAmount", label: "Amount for the headline", sample: "$540.18" },
  { name: "paidLabel", label: "Paid row label (Paid / Paid — held in escrow)", sample: "Paid" },
  { name: "refundedAmount", label: "Refunded amount (empty when nothing refunded)", sample: "" },
  { name: "statusNote", label: "Status explanation", sample: "" },
  { name: "statusColor", label: "Status colour (hex)", sample: "#d97706" },
  { name: "statusBg", label: "Status background colour (hex)", sample: "#fef3c7" },
  { name: "paymentMethod", label: "Payment method", sample: "Card ending 4242" },
  { name: "notes", label: "Notes", sample: "Thank you for choosing BINS APP." },
];

export const INVOICE_SAMPLE_DATA = {
  ...Object.fromEntries(INVOICE_VARIABLES.map((v) => [v.name, v.sample])),
  items: [
    { description: "20 Yard Dumpster — 7 day rental", quantity: "1", unitPrice: "$425.00", amount: "$425.00" },
    { description: "Extra tonnage (1.5 t)", quantity: "1.5", unitPrice: "$80.00", amount: "$120.00" },
    { description: "Delivery & pickup", quantity: "1", unitPrice: "$150.00", amount: "$150.00" },
  ],
};

const shell = (title, css, body) => `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:32px 16px;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;font-size:13px;line-height:1.5}
.sheet{max-width:780px;margin:0 auto;background:#fff}
table{width:100%;border-collapse:collapse}
.right{text-align:right}
.muted{color:#64748b}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none!important;border:0!important}}
${css}
</style>
</head>
<body>
${body}
</body>
</html>`;

const itemsRows = (cls = "") => `{{#items}}
        <tr class="${cls}">
          <td>{{description}}</td>
          <td class="right">{{quantity}}</td>
          <td class="right">{{unitPrice}}</td>
          <td class="right">{{amount}}</td>
        </tr>
        {{/items}}`;

const totalsBlock = `
        <tr><td class="muted">Subtotal</td><td class="right">{{subtotal}}</td></tr>
        <tr><td class="muted">Tax ({{taxRate}})</td><td class="right">{{tax}}</td></tr>
        {{#discount}}<tr><td class="muted">Discount</td><td class="right">-{{discount}}</td></tr>{{/discount}}
        <tr class="grand"><td>Total</td><td class="right">{{total}}</td></tr>
        <tr><td class="muted">{{paidLabel}}</td><td class="right">{{amountPaid}}</td></tr>
        {{#refundedAmount}}<tr><td class="muted">Refunded</td><td class="right" style="color:#dc2626">-{{refundedAmount}}</td></tr>{{/refundedAmount}}
        <tr class="due"><td>Balance due</td><td class="right">{{balanceDue}}</td></tr>
        {{#statusNote}}<tr><td colspan="2" style="padding-top:10px;font-size:12px;color:{{statusColor}}">{{statusNote}}</td></tr>{{/statusNote}}`;

export const INVOICE_DESIGNS = [
  {
    key: "invoice_classic",
    title: "Classic",
    summary: "Clean two-column header with a ruled line-item table. Works for every customer.",
    accentColor: "#0EBE3C",
    isDefault: true,
    html: shell(
      "Invoice {{invoiceNumber}}",
      `.sheet{padding:44px;border:1px solid #e2e8f0;border-radius:10px}
.head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0EBE3C;padding-bottom:20px}
.logo{height:52px;border-radius:50%}
h1{margin:0;font-size:28px;letter-spacing:.06em;color:#0EBE3C}
.meta td{padding:2px 0}
.parties{display:flex;gap:24px;margin:24px 0}
.parties>div{flex:1}
.label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:600;margin-bottom:4px}
.items th{background:#f8fafc;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#475569;padding:10px;border-bottom:1px solid #e2e8f0}
.items td{padding:10px;border-bottom:1px solid #f1f5f9}
.totals{width:300px;margin:20px 0 0 auto}
.totals td{padding:6px 0}
.totals .grand td{border-top:1px solid #e2e8f0;font-weight:700;font-size:15px;padding-top:10px}
.totals .due td{color:#0EBE3C;font-weight:700}
.foot{margin-top:36px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px}`,
      `<div class="sheet">
  <div class="head">
    <div>
      <img class="logo" src="{{logoUrl}}" alt="" />
      <div style="font-weight:700;font-size:15px;margin-top:8px">{{companyName}}</div>
      <div class="muted">{{companyAddress}}<br/>{{companyEmail}} · {{companyPhone}}</div>
    </div>
    <div class="right">
      <h1>INVOICE</h1>
      <table class="meta" style="width:auto;margin-left:auto">
        <tr><td class="muted">Invoice #</td><td class="right" style="padding-left:16px"><b>{{invoiceNumber}}</b></td></tr>
        <tr><td class="muted">Issued</td><td class="right">{{issueDate}}</td></tr>
        <tr><td class="muted">Due</td><td class="right">{{dueDate}}</td></tr>
        <tr><td class="muted">Status</td><td class="right">{{status}}</td></tr>
      </table>
    </div>
  </div>
  <div class="parties">
    <div><div class="label">Bill to</div><b>{{customerName}}</b><br/>{{customerAddress}}<br/>{{customerEmail}}<br/>{{customerPhone}}</div>
    <div><div class="label">Service</div>Order {{orderNumber}}<br/>{{serviceAddress}}</div>
  </div>
  <table class="items">
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Amount</th></tr></thead>
    <tbody>
        ${itemsRows()}
    </tbody>
  </table>
  <table class="totals">${totalsBlock}
  </table>
  <div class="foot">Payment: {{paymentMethod}}<br/>{{notes}}</div>
</div>`,
    ),
  },
  {
    key: "invoice_modern",
    title: "Modern band",
    summary: "Full-width brand-colour band with a big total. Good for consumer receipts.",
    accentColor: "#0EBE3C",
    html: shell(
      "Invoice {{invoiceNumber}}",
      `.sheet{border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08)}
.band{background:#0a1a2f;color:#fff;padding:32px 40px;display:flex;justify-content:space-between;align-items:center;gap:20px}
.band img{height:48px;border-radius:50%;background:#fff}
.band h1{margin:0;font-size:22px}
.band .num{color:#86efac;font-weight:600}
.amount{background:#0EBE3C;color:#fff;padding:18px 40px;display:flex;justify-content:space-between;align-items:center}
.amount b{font-size:26px}
.body{padding:32px 40px}
.grid{display:flex;gap:16px;margin-bottom:24px}
.card{flex:1;background:#f8fafc;border-radius:10px;padding:14px}
.label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:600;margin-bottom:4px}
.items th{text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;padding:8px 0;border-bottom:2px solid #0a1a2f}
.items td{padding:12px 0;border-bottom:1px solid #eef2f7}
.totals{width:280px;margin:18px 0 0 auto}
.totals td{padding:5px 0}
.totals .grand td{font-weight:700;font-size:15px;border-top:2px solid #0a1a2f;padding-top:10px}
.totals .due td{color:#0EBE3C;font-weight:700}
.foot{padding:18px 40px;background:#f8fafc;color:#64748b;font-size:12px}`,
      `<div class="sheet">
  <div class="band">
    <div style="display:flex;gap:14px;align-items:center"><img src="{{logoUrl}}" alt=""/><div><h1>{{companyName}}</h1><div style="opacity:.75">{{companyEmail}} · {{companyPhone}}</div></div></div>
    <div class="right"><div style="opacity:.75">Invoice</div><div class="num">{{invoiceNumber}}</div></div>
  </div>
  <div class="amount" style="background:{{statusColor}}"><span>{{headlineLabel}}</span><b>{{headlineAmount}}</b></div>
  <div class="body">
    <div class="grid">
      <div class="card"><div class="label">Billed to</div><b>{{customerName}}</b><br/>{{customerEmail}}<br/>{{customerPhone}}</div>
      <div class="card"><div class="label">Service address</div>{{serviceAddress}}<br/><span class="muted">Order {{orderNumber}}</span></div>
      <div class="card"><div class="label">Issued</div>{{issueDate}}<br/><span class="muted">Status: {{status}}</span></div>
    </div>
    <table class="items">
      <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${itemsRows()}
      </tbody>
    </table>
    <table class="totals">${totalsBlock}
    </table>
  </div>
  <div class="foot">{{notes}} · Paid via {{paymentMethod}}</div>
</div>`,
    ),
  },
  {
    key: "invoice_minimal",
    title: "Minimal",
    summary: "Black-and-white, typographic layout that prints cleanly on any printer.",
    accentColor: "#0f172a",
    html: shell(
      "Invoice {{invoiceNumber}}",
      `.sheet{padding:56px;border:1px solid #e5e7eb}
h1{font-weight:300;font-size:40px;margin:0 0 4px;letter-spacing:-.02em}
.row{display:flex;justify-content:space-between;gap:24px;margin-top:36px}
.label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#94a3b8;margin-bottom:6px}
.items{margin-top:40px}
.items th{text-align:left;font-weight:500;font-size:11px;color:#94a3b8;padding-bottom:10px;border-bottom:1px solid #0f172a}
.items td{padding:12px 0;border-bottom:1px solid #f1f5f9}
.totals{width:260px;margin:24px 0 0 auto}
.totals td{padding:5px 0}
.totals .grand td{font-size:18px;font-weight:600;padding-top:12px;border-top:1px solid #0f172a}
.totals .due td{font-weight:600}
.foot{margin-top:56px;font-size:12px;color:#94a3b8}`,
      `<div class="sheet">
  <h1>Invoice</h1>
  <div class="muted">{{invoiceNumber}} · {{issueDate}}</div>
  <div class="row">
    <div><div class="label">From</div>{{companyName}}<br/>{{companyAddress}}<br/>{{companyEmail}}</div>
    <div><div class="label">To</div>{{customerName}}<br/>{{customerAddress}}<br/>{{customerEmail}}</div>
    <div class="right"><div class="label">{{status}}</div>{{headlineLabel}}<br/><b style="color:{{statusColor}}">{{headlineAmount}}</b></div>
  </div>
  <table class="items">
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
    <tbody>
        ${itemsRows()}
    </tbody>
  </table>
  <table class="totals">${totalsBlock}
  </table>
  <div class="foot">{{notes}}</div>
</div>`,
    ),
  },
  {
    key: "invoice_commercial",
    title: "Commercial statement",
    summary: "Detailed builder/company layout with PO-style boxes, order and site references.",
    accentColor: "#1d4ed8",
    html: shell(
      "Statement {{invoiceNumber}}",
      `.sheet{padding:36px;border:1px solid #cbd5e1}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
.top img{height:44px;border-radius:50%}
.title{background:#0a1a2f;color:#fff;padding:8px 16px;font-weight:700;letter-spacing:.14em;font-size:13px;display:inline-block}
.boxes{display:flex;border:1px solid #cbd5e1;margin:22px 0}
.boxes>div{flex:1;padding:10px 12px;border-right:1px solid #cbd5e1}
.boxes>div:last-child{border-right:0}
.label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:700}
.two{display:flex;gap:16px}
.two>div{flex:1;border:1px solid #cbd5e1;padding:12px}
.items{margin-top:20px;border:1px solid #cbd5e1}
.items th{background:#e2e8f0;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase}
.items td{padding:8px 10px;border-top:1px solid #e2e8f0}
.totals{width:320px;margin:0 0 0 auto;border:1px solid #cbd5e1;border-top:0}
.totals td{padding:7px 10px}
.totals .grand td{background:#f1f5f9;font-weight:700}
.totals .due td{background:#0a1a2f;color:#fff;font-weight:700}
.foot{margin-top:24px;font-size:11px;color:#475569}`,
      `<div class="sheet">
  <div class="top">
    <div style="display:flex;gap:12px;align-items:center"><img src="{{logoUrl}}" alt=""/><div><b style="font-size:15px">{{companyName}}</b><br/><span class="muted">{{companyAddress}} · {{companyPhone}}</span></div></div>
    <div class="title">COMMERCIAL INVOICE</div>
  </div>
  <div class="boxes">
    <div><div class="label">Invoice #</div>{{invoiceNumber}}</div>
    <div><div class="label">Issue date</div>{{issueDate}}</div>
    <div><div class="label">Due date</div>{{dueDate}}</div>
    <div><div class="label">Order</div>{{orderNumber}}</div>
    <div><div class="label">Status</div><b style="color:{{statusColor}}">{{status}}</b></div>
  </div>
  <div class="two">
    <div><div class="label">Bill to</div><b>{{customerName}}</b><br/>{{customerAddress}}<br/>{{customerEmail}} · {{customerPhone}}</div>
    <div><div class="label">Job site</div>{{serviceAddress}}</div>
  </div>
  <table class="items">
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit</th><th class="right">Extended</th></tr></thead>
    <tbody>
        ${itemsRows()}
    </tbody>
  </table>
  <table class="totals">${totalsBlock}
  </table>
  <div class="foot"><b>{{headlineLabel}}</b> — {{headlineAmount}} via {{paymentMethod}}. {{notes}}</div>
</div>`,
    ),
  },
  {
    key: "invoice_receipt",
    title: "Compact receipt",
    summary: "Narrow, mobile-friendly receipt for paid orders and SMS/email links.",
    accentColor: "#0EBE3C",
    html: shell(
      "Receipt {{invoiceNumber}}",
      `.sheet{max-width:420px;padding:28px 26px;border-radius:16px;border:1px solid #e2e8f0}
.c{text-align:center}
.c img{height:56px;border-radius:50%}
.paid{display:inline-block;margin-top:10px;background:#dcfce7;color:#15803d;font-weight:700;font-size:11px;letter-spacing:.1em;padding:4px 10px;border-radius:999px}
.big{font-size:32px;font-weight:700;margin:14px 0 2px}
.dash{border-top:1px dashed #cbd5e1;margin:18px 0}
.items td{padding:6px 0;vertical-align:top}
.items th{display:none}
.totals td{padding:4px 0}
.totals .grand td{font-weight:700;font-size:15px;padding-top:8px}
.totals .due td{color:#0EBE3C;font-weight:700}`,
      `<div class="sheet">
  <div class="c">
    <img src="{{logoUrl}}" alt=""/>
    <div style="font-weight:700;margin-top:6px">{{companyName}}</div>
    <div class="paid" style="background:{{statusBg}};color:{{statusColor}}">{{status}}</div>
    <div class="big">{{headlineAmount}}</div>
    <div class="muted" style="margin-bottom:4px">{{headlineLabel}}</div>
    <div class="muted">{{invoiceNumber}} · {{issueDate}}</div>
  </div>
  <div class="dash"></div>
  <div><b>{{customerName}}</b><br/><span class="muted">{{serviceAddress}}</span></div>
  <div class="dash"></div>
  <table class="items">
    <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>
        {{#items}}<tr><td>{{description}}<br/><span class="muted">{{quantity}} × {{unitPrice}}</span></td><td></td><td></td><td class="right">{{amount}}</td></tr>{{/items}}
    </tbody>
  </table>
  <div class="dash"></div>
  <table class="totals">${totalsBlock}
  </table>
  <div class="dash"></div>
  <div class="c muted" style="font-size:12px">{{paymentMethod}}<br/>{{notes}}</div>
</div>`,
    ),
  },
];

/** Sample values for a system email template (used by previews). */
export const sampleVarsFor = (variables = []) =>
  Object.fromEntries((variables || []).map((v) => [v.name, v.sample || ""]));
