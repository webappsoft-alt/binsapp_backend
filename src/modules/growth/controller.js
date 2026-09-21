import growthService from "./service.js";

export async function getGrowthProfile(req, res, next) {
  try {
    const data = await growthService.getProfile(req.user._id);
    res.status(200).json({
      success: true,
      message: "Growth profile fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function listGrowthCatalog(req, res, next) {
  try {
    const data = await growthService.listCatalog({
      branded: req.query.branded,
      size: req.query.size,
      packageKey: req.query.packageKey,
    });
    res.status(200).json({
      success: true,
      message: "Fleet catalog fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function submitFinancingApplication(req, res, next) {
  try {
    const data = await growthService.submitFinancingApplication(
      req.user._id,
      req.body,
    );
    res.status(201).json({
      success: true,
      message: "Financing application submitted",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyFinancingApplications(req, res, next) {
  try {
    const data = await growthService.listMyApplications(req.user._id);
    res.status(200).json({
      success: true,
      message: "Financing applications fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getGrowthConfig(req, res, next) {
  try {
    const data = await growthService.getConfig();
    res.status(200).json({
      success: true,
      message: "Growth config fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateGrowthConfig(req, res, next) {
  try {
    const data = await growthService.updateConfig(req.body);
    res.status(200).json({
      success: true,
      message: "Growth config updated",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminListCatalog(req, res, next) {
  try {
    const data = await growthService.adminListCatalog({
      active: req.query.active,
      search: req.query?.search,
    });
    res.status(200).json({
      success: true,
      message: "Catalog fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCatalogItem(req, res, next) {
  try {
    const data = await growthService.createCatalogItem(req.body);
    res.status(201).json({
      success: true,
      message: "Catalog item created",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCatalogItem(req, res, next) {
  try {
    const data = await growthService.updateCatalogItem(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Catalog item updated",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCatalogItem(req, res, next) {
  try {
    const data = await growthService.deleteCatalogItem(req.params.id);
    res.status(200).json({
      success: true,
      message: "Catalog item deleted",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminListApplications(req, res, next) {
  try {
    const data = await growthService.adminListApplications({
      search: req.query?.search,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      message: "Applications fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function decideApplication(req, res, next) {
  try {
    const data = await growthService.decideApplication(
      req.params.id,
      req.user._id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: "Application updated",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminListOperators(req, res, next) {
  try {
    const data = await growthService.adminListOperators({
      sort: req.query.sort,
      page: req.query.page,
      limit: req.query.limit,
      search: req.query?.search,
    });
    res.status(200).json({
      success: true,
      message: "Operator growth profiles fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function overrideOperator(req, res, next) {
  try {
    const data = await growthService.overrideOperator(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Operator growth override applied",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function setDumbsterBranded(req, res, next) {
  try {
    const data = await growthService.setDumbsterBranded(
      req.params.id,
      req.body.branded,
    );
    res.status(200).json({
      success: true,
      message: "Dumbster branded flag updated",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminApplyPenalty(req, res, next) {
  try {
    const data = await growthService.adminApplyPenalty(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Penalty applied",
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminRemovePenalty(req, res, next) {
  try {
    const data = await growthService.adminRemovePenalty(
      req.params.id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: "Penalty removed",
      data,
    });
  } catch (error) {
    next(error);
  }
}
