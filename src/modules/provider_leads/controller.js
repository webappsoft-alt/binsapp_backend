import providerLeadsService from "./service.js";

/**
 * Public/Customer endpoint: Submit a direct lead for a specific provider
 * POST /api/public/provider-leads or POST /api/provider-leads
 */
export const createDirectLeadController = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "You must be logged in to request a direct quote from a provider.",
      });
    }

    const {
      providerId,
      customerInfo,
      serviceType,
      dumpsterSize,
      dumpsterId,
      projectType,
      startDate,
      numDays,
      placementNotes,
      drivewayProtection,
    } = req.body;

    const lead = await providerLeadsService.createDirectLead({
      providerId,
      customerInfo,
      serviceType,
      dumpsterSize,
      dumpsterId,
      projectType,
      startDate,
      numDays,
      placementNotes,
      drivewayProtection,
      customerId,
    });

    res.status(201).json({
      success: true,
      message: "Direct lead submitted successfully. The provider will generate an estimate.",
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Provider endpoint: Fetch leads received by this provider
 * GET /api/provider-leads/provider
 */
export const getProviderLeadsController = async (req, res, next) => {
  try {
    const providerId = req.user._id;
    const { status, page, limit, search } = req.query;

    const result = await providerLeadsService.getProviderLeads(providerId, {
      status,
      page,
      limit,
      search,
    });

    res.status(200).json({
      success: true,
      message: "Provider leads fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Customer endpoint: Fetch leads requested by customer
 * GET /api/provider-leads/customer
 */
export const getCustomerLeadsController = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    const email = req.query.email || req.user?.email;

    // Opt-in server pagination (commercial portal table). Without `page`
    // the legacy full-list response shape is returned unchanged.
    if (req.query.page) {
      const result = await providerLeadsService.getCustomerLeadsPaged({
        customerId,
        email,
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
        search: req.query.search,
        hasEstimate: ["1", "true"].includes(String(req.query.hasEstimate || "")),
      });
      return res.status(200).json({
        success: true,
        message: "Customer leads fetched successfully",
        data: result.leads,
        counts: result.counts,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    }

    const leads = await providerLeadsService.getCustomerLeads({
      customerId,
      email,
    });

    const estimatesReady = leads.filter((l) => l.status === "estimate_sent").length;
    const pending = leads.filter((l) => l.status === "pending").length;
    const converted = leads.filter((l) => l.status === "converted").length;

    res.status(200).json({
      success: true,
      message: "Customer leads fetched successfully",
      data: leads,
      counts: {
        all: leads.length,
        estimatesReady,
        pending,
        converted,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single lead details by ID or leadNumber
 * GET /api/provider-leads/:id
 */
export const getLeadByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const lead = await providerLeadsService.getLeadById(id);

    res.status(200).json({
      success: true,
      message: "Lead details fetched successfully",
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Provider submits or updates an estimate for a lead
 * POST /api/provider-leads/:id/estimate
 */
export const submitEstimateController = async (req, res, next) => {
  try {
    const providerId = req.user._id;
    const { id } = req.params;
    const {
      estimatedPrice,
      includedTons,
      rentalDays,
      extraDayPrice,
      overagePerTon,
      deliveryFee,
      validDays,
      providerNotes,
    } = req.body;

    const updatedLead = await providerLeadsService.createOrUpdateEstimate(
      id,
      providerId,
      {
        estimatedPrice,
        includedTons,
        rentalDays,
        extraDayPrice,
        overagePerTon,
        deliveryFee,
        validDays,
        providerNotes,
      }
    );

    res.status(200).json({
      success: true,
      message: "Estimate sent to customer successfully",
      data: updatedLead,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Customer accepts estimate -> Creates Order assigned EXCLUSIVELY to this provider!
 * POST /api/provider-leads/:id/accept-estimate
 */
export const acceptEstimateController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customerId = req.user?._id || null;
    const { customerEmail } = req.body;

    const result = await providerLeadsService.acceptEstimate(id, {
      customerId,
      customerEmail,
    });

    res.status(200).json({
      success: true,
      message: "Estimate accepted! Order has been created directly with this provider.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Customer declines estimate
 * POST /api/provider-leads/:id/decline-estimate
 */
export const declineEstimateController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const lead = await providerLeadsService.declineEstimate(id, reason);

    res.status(200).json({
      success: true,
      message: "Estimate declined.",
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Provider endpoint: Create a lead manually
 * POST /api/provider-leads/provider/manual
 */
export const createManualProviderLeadController = async (req, res, next) => {
  try {
    const providerId = req.user._id;
    const {
      customerId,
      customerInfo,
      serviceType,
      dumpsterSize,
      projectType,
      startDate,
      numDays,
      placementNotes,
      drivewayProtection,
      source,
      initialEstimate,
      autoCreateCustomer,
      unitId,
    } = req.body;

    const lead = await providerLeadsService.createProviderManualLead({
      providerId,
      customerId,
      customerInfo,
      serviceType,
      dumpsterSize,
      projectType,
      startDate,
      numDays,
      placementNotes,
      drivewayProtection,
      source,
      initialEstimate,
      autoCreateCustomer: autoCreateCustomer !== false,
      unitId,
    });

    res.status(201).json({
      success: true,
      message: "Lead created successfully.",
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};
