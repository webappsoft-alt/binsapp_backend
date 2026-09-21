import leadService from "./service.js";

export async function createDemoRequest(req, res, next) {
  try {
    const lead = await leadService.createDemoRequest(req.body);
    res.status(201).json({
      success: true,
      message: "Demo request submitted",
      data: lead,
    });
  } catch (error) {
    next(error);
  }
}

export async function listLeads(req, res, next) {
  try {
    const result = await leadService.listLeads({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      message: "Leads fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateLead(req, res, next) {
  try {
    const lead = await leadService.updateLead(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Lead updated successfully",
      data: lead,
    });
  } catch (error) {
    next(error);
  }
}
