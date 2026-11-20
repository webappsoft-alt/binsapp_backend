import service from "./service.js";

const ok = (res, status, message, data) => res.status(status).json({ success: true, message, data });

export const createTemplate = async (req, res, next) => {
  try {
    ok(res, 201, "Template created successfully", await service.createTemplate(req.body, req.user?._id));
  } catch (error) {
    next(error);
  }
};

export const getAllTemplates = async (req, res, next) => {
  try {
    ok(res, 200, "Templates fetched successfully", await service.getAllTemplates(req.query));
  } catch (error) {
    next(error);
  }
};

export const getTemplateById = async (req, res, next) => {
  try {
    ok(res, 200, "Template fetched successfully", await service.getTemplateById(req.params.id));
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    ok(res, 200, "Template updated successfully", await service.updateTemplate(req.params.id, req.body, req.user?._id));
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    ok(res, 200, "Template deleted successfully", await service.deleteTemplate(req.params.id));
  } catch (error) {
    next(error);
  }
};

export const syncSystemTemplates = async (req, res, next) => {
  try {
    ok(res, 200, "System templates synced", await service.syncSystemTemplates());
  } catch (error) {
    next(error);
  }
};

export const resetTemplate = async (req, res, next) => {
  try {
    ok(res, 200, "Template restored to the code default", await service.resetTemplate(req.params.id, req.user?._id));
  } catch (error) {
    next(error);
  }
};

export const duplicateTemplate = async (req, res, next) => {
  try {
    ok(res, 201, "Template duplicated", await service.duplicateTemplate(req.params.id, req.user?._id));
  } catch (error) {
    next(error);
  }
};

export const renderTemplate = async (req, res, next) => {
  try {
    ok(res, 200, "Template rendered", await service.renderTemplate({ ...req.body, id: req.params.id || req.body.id }));
  } catch (error) {
    next(error);
  }
};

export const getDefaultInvoice = async (req, res, next) => {
  try {
    ok(res, 200, "Default invoice template", await service.getDefaultInvoice());
  } catch (error) {
    next(error);
  }
};
