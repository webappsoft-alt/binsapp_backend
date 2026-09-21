import service from "./service.js";

export const createTemplate = async (req, res, next) => {
  try {
    const template = await service.createTemplate(req.body);
    res.status(201).json({
      success: true,
      message: "Template created successfully",
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllTemplates = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const templates = await service.getAllTemplates(search, page, limit);
    res.status(200).json({
      success: true,
      message: "Templates fetched successfully",
      data: templates,
    });
  } catch (error) {
    next(error);
  }
};

export const getTemplateById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await service.getTemplateById(id);
    res.status(200).json({
      success: true,
      message: "Template fetched successfully",
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await service.updateTemplate(id, req.body);
    res.status(200).json({
      success: true,
      message: "Template updated successfully",
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await service.deleteTemplate(id);
    res.status(200).json({
      success: true,
      message: "Template deleted successfully",
      data: template,
    });
  } catch (error) {
    next(error);
  }
};
