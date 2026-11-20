import Template from "../../models/Template.js";
import { NotFoundError, BadRequestError } from "../../utils/apiError.js";
import {
  SYSTEM_EMAIL_TEMPLATES,
  INVOICE_DESIGNS,
  INVOICE_VARIABLES,
  INVOICE_SAMPLE_DATA,
  sampleVarsFor,
} from "../../utils/systemTemplates.js";
import { renderTemplateString, extractTemplateVariables } from "../../utils/templateEngine.js";
import { loadTemplateOverrides } from "../../utils/templateOverrides.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class TemplateService {
  /**
   * Make sure every code template and invoice design has a row in the DB. Missing rows are
   * inserted; existing rows are left alone unless they're still un-customised, in which case
   * their HTML is refreshed from code so the library never shows a stale copy.
   */
  async syncSystemTemplates() {
    let created = 0;
    let refreshed = 0;

    for (const t of SYSTEM_EMAIL_TEMPLATES) {
      const html = t.build();
      const existing = await Template.findOne({ key: t.key });
      if (!existing) {
        await Template.create({
          key: t.key,
          kind: "system",
          category: "email",
          title: t.title,
          subject: t.subject,
          group: t.group,
          summary: t.summary,
          editorMode: "html",
          variables: t.variables,
          subjectEditable: t.subjectEditable !== false,
          description: html,
          html,
        });
        created += 1;
      } else if (!existing.isCustomized && existing.html !== html) {
        existing.html = html;
        existing.description = html;
        existing.variables = t.variables;
        existing.summary = t.summary;
        existing.group = t.group;
        await existing.save();
        refreshed += 1;
      }
    }

    const hasDefaultInvoice = await Template.exists({ category: "invoice", isDefault: true });
    for (const d of INVOICE_DESIGNS) {
      const existing = await Template.findOne({ key: d.key });
      if (!existing) {
        await Template.create({
          key: d.key,
          kind: "system",
          category: "invoice",
          title: d.title,
          subject: "Invoice {{invoiceNumber}} from {{companyName}}",
          group: "Invoices",
          summary: d.summary,
          editorMode: "html",
          variables: INVOICE_VARIABLES,
          accentColor: d.accentColor,
          isDefault: Boolean(d.isDefault && !hasDefaultInvoice),
          description: d.html,
          html: d.html,
        });
        created += 1;
      } else if (!existing.isCustomized && existing.html !== d.html) {
        existing.html = d.html;
        existing.description = d.html;
        await existing.save();
        refreshed += 1;
      }
    }

    await loadTemplateOverrides();
    return { created, refreshed };
  }

  async ensureSeeded(category) {
    const filter = category ? { kind: "system", category } : { kind: "system" };
    const count = await Template.countDocuments(filter);
    const expected =
      category === "invoice"
        ? INVOICE_DESIGNS.length
        : category === "email"
          ? SYSTEM_EMAIL_TEMPLATES.length
          : SYSTEM_EMAIL_TEMPLATES.length + INVOICE_DESIGNS.length;
    if (count < expected) await this.syncSystemTemplates();
  }

  async createTemplate(templateData, userId) {
    const data = { ...templateData, kind: "custom", updatedBy: userId || null };
    delete data.key;
    if (!data.html) data.html = data.description || "";
    if (!data.variables?.length) {
      data.variables = extractTemplateVariables(`${data.subject || ""} ${data.html}`).map((name) => ({ name, label: name }));
    }
    if (data.isDefault && data.category === "invoice") {
      await Template.updateMany({ category: "invoice" }, { isDefault: false });
    }
    const template = await Template.create(data);
    return template;
  }

  async getAllTemplates({ search, page = 1, limit = 10, category, kind, group, status } = {}) {
    await this.ensureSeeded(category);
    const query = {};
    if (category === "invoice") query.category = "invoice";
    else if (category === "email") query.category = { $ne: "invoice" };
    if (kind && kind !== "all") query.kind = kind === "custom" ? { $ne: "system" } : kind;
    if (group && group !== "all") query.group = group;
    if (status === "active") query.isActive = { $ne: false };
    if (status === "inactive") query.isActive = false;
    if (status === "customized") query.isCustomized = true;
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: "i" };
      query.$or = [{ title: rx }, { subject: rx }, { key: rx }, { group: rx }];
    }
    const pageNum = Math.max(1, Number(page) || 1);
    const lim = Math.min(200, Math.max(1, Number(limit) || 10));

    const baseCategory = category === "invoice" ? { category: "invoice" } : { category: { $ne: "invoice" } };
    const [templates, total, counts] = await Promise.all([
      Template.find(query)
        .sort({ isDefault: -1, kind: 1, updatedAt: -1 })
        .skip((pageNum - 1) * lim)
        .limit(lim)
        .populate("updatedBy", "name email")
        .lean(),
      Template.countDocuments(query),
      Template.aggregate([
        { $match: baseCategory },
        {
          $group: {
            _id: null,
            all: { $sum: 1 },
            system: { $sum: { $cond: [{ $eq: ["$kind", "system"] }, 1, 0] } },
            custom: { $sum: { $cond: [{ $ne: ["$kind", "system"] }, 1, 0] } },
            customized: { $sum: { $cond: [{ $eq: ["$isCustomized", true] }, 1, 0] } },
          },
        },
      ]),
    ]);
    const groups = await Template.distinct("group", baseCategory);
    return {
      templates,
      total,
      page: pageNum,
      totalPages: Math.max(1, Math.ceil(total / lim)),
      counts: counts[0] || { all: 0, system: 0, custom: 0, customized: 0 },
      groups: groups.filter(Boolean).sort(),
    };
  }

  async getTemplateById(id) {
    const template = await Template.findById(id).populate("updatedBy", "name email").lean();
    if (!template) throw new NotFoundError("Template not found");
    return template;
  }

  async updateTemplate(id, templateData, userId) {
    const existing = await Template.findById(id);
    if (!existing) throw new NotFoundError("Template not found");

    const data = { ...templateData, updatedBy: userId || null };
    delete data.key;
    delete data.kind;
    delete data.category;
    if (existing.kind === "system") {
      if (existing.subjectEditable === false) delete data.subject;
      if (data.html !== undefined || data.description !== undefined || data.subject !== undefined) {
        data.isCustomized = true;
      }
    }
    if (data.html === undefined && data.description !== undefined && existing.editorMode !== "html") {
      data.html = data.description;
    }
    if (data.isDefault && existing.category === "invoice") {
      await Template.updateMany({ category: "invoice", _id: { $ne: existing._id } }, { isDefault: false });
    }
    Object.assign(existing, data);
    await existing.save();
    if (existing.kind === "system") await loadTemplateOverrides();
    return existing;
  }

  async resetTemplate(id, userId) {
    const existing = await Template.findById(id);
    if (!existing) throw new NotFoundError("Template not found");
    if (existing.kind !== "system") throw new BadRequestError("Only system templates can be reset");

    const email = SYSTEM_EMAIL_TEMPLATES.find((t) => t.key === existing.key);
    const invoice = INVOICE_DESIGNS.find((d) => d.key === existing.key);
    if (!email && !invoice) throw new NotFoundError("No code default exists for this template");

    const html = email ? email.build() : invoice.html;
    existing.html = html;
    existing.description = html;
    existing.isCustomized = false;
    if (email) {
      existing.subject = email.subject;
      existing.variables = email.variables;
    }
    existing.updatedBy = userId || null;
    await existing.save();
    await loadTemplateOverrides();
    return existing;
  }

  async duplicateTemplate(id, userId) {
    const src = await Template.findById(id).lean();
    if (!src) throw new NotFoundError("Template not found");
    const { _id, key, createdAt, updatedAt, __v, ...rest } = src;
    return Template.create({
      ...rest,
      title: `${src.title} (copy)`,
      kind: "custom",
      isCustomized: false,
      isDefault: false,
      updatedBy: userId || null,
    });
  }

  async deleteTemplate(id) {
    const existing = await Template.findById(id);
    if (!existing) throw new NotFoundError("Template not found");
    if (existing.kind === "system") {
      throw new BadRequestError("System templates can't be deleted. Reset or deactivate them instead.");
    }
    await existing.deleteOne();
    return existing;
  }

  /** Render a template (or raw html) with variables; falls back to sample data. */
  async renderTemplate({ id, html, subject, variables, data, category: requestedCategory }) {
    let source = html;
    let subj = subject;
    let vars = variables;
    let category = requestedCategory === "invoice" ? "invoice" : "email";
    if (id) {
      const t = await Template.findById(id).lean();
      if (!t) throw new NotFoundError("Template not found");
      source = source ?? t.html ?? t.description;
      subj = subj ?? t.subject;
      vars = vars ?? t.variables;
      category = t.category;
    }
    const sample = category === "invoice" ? INVOICE_SAMPLE_DATA : sampleVarsFor(vars);
    const merged = { year: new Date().getFullYear(), ...sample, ...(data || {}) };
    return {
      html: renderTemplateString(source || "", merged),
      subject: renderTemplateString(subj || "", merged),
    };
  }

  async getDefaultInvoice() {
    await this.ensureSeeded("invoice");
    return (
      (await Template.findOne({ category: "invoice", isDefault: true, isActive: { $ne: false } }).lean()) ||
      (await Template.findOne({ category: "invoice" }).lean())
    );
  }
}

export default new TemplateService();
