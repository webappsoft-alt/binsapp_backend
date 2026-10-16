import companyService from "./service.js";
import * as commercialService from "./commercialService.js";
import Company from "../../models/Company.js";

export const createCompany = async (req, res, next) => {
  try {
    const company = await companyService.createCompany(req.user._id, req.body);
    res.status(201).json({
      status: "success",
      message: "Company created successfully",
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCompany = async (req, res, next) => {
  try {
    const company = await companyService.updateCompany(req.params.id, req.body);
    res.status(200).json({
      status: "success",
      message: "Company updated successfully",
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserCompany = async (req, res, next) => {
  try {
    const company = await companyService.getUserCompany(req.user._id);
    res.status(200).json({
      status: "success",
      message: "Company fetched successfully",
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllCompanies = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      email,
      phone,
      sortBy = "updatedAt",
      sortOrder = "desc",
    } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search && search.trim() !== "") {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { companyName: { $regex: safeSearch, $options: "i" } },
        { legalBusinessName: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
      ];
    }
    if (email) query.email = email;
    if (phone) query.phone = phone;
    const companies = await companyService.getAllCompanies(query, {
      page,
      limit,
      sortBy,
      sortOrder,
    });
    res.status(200).json({
      status: "success",
      message: "Companies fetched successfully",
      data: companies,
    });
  } catch (error) {
    next(error);
  }
};

export const getCompanyByIdAdmin = async (req, res, next) => {
  try {
    const company = await companyService.getCompanyByIdAdmin(req.params.id);
    res.status(200).json({
      status: "success",
      message: "Company fetched successfully",
      data: { company },
    });
  } catch (error) {
    next(error);
  }
};

export const adminUpdateCompanyStatus = async (req, res, next) => {
  try {
    const company = await companyService.adminUpdateCompanyStatus(
      req.params.id,
      req.body,
    );
    res.status(200).json({
      status: "success",
      message: "Company status updated successfully",
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

export const createJobSite = async (req, res, next) => {
  try {
    let companyId = req.user.company;
    if (!companyId) {
      const comp = await Company.findOne({ user: req.user._id });
      if (comp) companyId = comp._id;
    }
    const jobSite = await companyService.createJobSite(
      req.user._id,
      companyId,
      req.body,
    );
    res.status(201).json({
      status: "success",
      message: "Job site created successfully",
      data: jobSite,
    });
  } catch (error) {
    next(error);
  }
};

export const getJobSites = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, city } = req.query;
    let companyId = req.user.company;
    if (!companyId) {
      const comp = await Company.findOne({ user: req.user._id });
      if (comp) companyId = comp._id;
    }
    const orConditions = [{ user: req.user._id }];
    if (companyId) {
      orConditions.push({ company: companyId });
    }
    const query = orConditions.length > 1 ? { $or: orConditions } : orConditions[0];
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.siteName = { $regex: safeSearch, $options: "i" };
    }
    if (city) {
      query.city = city;
    }
    const jobSites = await companyService.getJobSite(query, {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    });
    res.status(200).json({
      status: "success",
      message: "Job sites fetched successfully",
      data: jobSites,
    });
  } catch (error) {
    next(error);
  }
};

export const updateJobSite = async (req, res, next) => {
  try {
    const jobSite = await companyService.updateJobSite(req.params.id, req.body);
    res.status(200).json({
      status: "success",
      message: "Job site updated successfully",
      data: jobSite,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteJobSite = async (req, res, next) => {
  try {
    const jobSite = await companyService.deleteJobSite(req.params.id);
    res.status(200).json({
      status: "success",
      message: "Job site deleted successfully",
      data: jobSite,
    });
  } catch (error) {
    next(error);
  }
};

export const quoteCommercial = async (req, res, next) => {
  try {
    const quote = await commercialService.getQuoteForUser(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: "Quote calculated successfully",
      data: quote,
    });
  } catch (error) {
    next(error);
  }
};

export const getCompanyBilling = async (req, res, next) => {
  try {
    const result = await commercialService.listCompanyBilling(req.user._id, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      builderOfferId: req.query.builderOfferId || req.query.offerId,
      jobsiteId: req.query.jobsiteId || req.query.jobSiteId,
    });
    res.status(200).json({
      success: true,
      message: "Billing records fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const createSwapRequest = async (req, res, next) => {
  try {
    const result = await commercialService.createSwapRequest(
      req.user._id,
      req.params.orderId || req.body.orderId,
      req.body,
    );
    res.status(201).json({
      success: true,
      message: "Swap request created",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSwapRequest = async (req, res, next) => {
  try {
    const order = await commercialService.updateSwapStatus(
      req.user._id,
      req.params.orderId,
      req.body.status,
      { role: "customer" },
    );
    res.status(200).json({
      success: true,
      message: "Swap status updated",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};
