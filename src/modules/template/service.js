import Template from "../../models/Template.js";
import { NotFoundError } from "../../utils/apiError.js";
class TemplateService {
  async createTemplate(templateData) {
    try {
      const template = await Template.create(templateData);
      return template;
    } catch (error) {
      throw error;
    }
  }

  async getAllTemplates(search, page, limit) {
    try {
      const query = {};
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { subject: { $regex: search, $options: "i" } },
        ];
      }
      const skip = (page - 1) * limit;
      const templates = await Template.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      const total = await Template.countDocuments(query);
      return { templates, total };
    } catch (error) {
      throw error;
    }
  }

  async getTemplateById(id) {
    try {
      const template = await Template.findById(id);
      if (!template) {
        throw new NotFoundError("Template not found");
      }
      return template;
    } catch (error) {
      throw error;
    }
  }

  async updateTemplate(id, templateData) {
    try {
      const template = await Template.findByIdAndUpdate(id, templateData, {
        new: true,
      });
      if (!template) {
        throw new NotFoundError("Template not found");
      }
      return template;
    } catch (error) {
      throw error;
    }
  }

  async deleteTemplate(id) {
    try {
      const template = await Template.findByIdAndDelete(id);
      if (!template) {
        throw new NotFoundError("Template not found");
      }
      return template;
    } catch (error) {
      throw error;
    }
  }
}

export default new TemplateService();
