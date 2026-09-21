import joi from "joi";

export const loginSchema = joi.object({
  email: joi.string().email().required(),
  password: joi.string().required(),
});

export const updateSchema = joi.object({
  name: joi.string().optional(),
  radius: joi.number().optional().allow(null, ""),
  // comp_name: joi.string().optional(),
  email: joi.string().email().optional(),
  phone: joi.string().optional(),
  address: joi.string().allow("").optional(),
  lat: joi.number().optional(),
  lng: joi.number().optional(),
  radius: joi.number().allow(null, "").optional(),
  status: joi
    .string()
    .optional()
    .valid("online", "offline", "deleted", "deactivated"),
  role: joi.string().optional().valid("admin", "renter", "user"),
  profilePicture: joi.string().allow(null, "").optional(),
  driving_license: joi.string().allow(null, "").optional(),
  location: joi
    .object({
      type: joi.string().optional(),
      coordinates: joi.array().optional(),
    })
    .optional(),
  fcmtoken: joi.string().optional().allow(null, ""),
  // Often sent with admin “listing / dustbin” edits; kept so stripUnknown does not drop them
  userId: joi.string().optional(),
  dumbster: joi.string().optional(),
  quantity: joi.number().optional(),
  type: joi.string().optional(),
  locationObject: joi
    .object({
      type: joi.string().optional(),
      coordinates: joi.array().optional(),
      city: joi.string().optional(),
      country: joi.string().optional(),
      address: joi.string().allow("").optional(),
    })
    .optional(),
});

export const sendEmailSchema = joi.object({
  type: joi.string().required().valid("all", "rentee", "renter", "users"),
  subject: joi.string().required(),
  html: joi.string().required(),
  users: joi.array().optional(),
  isTemplate: joi.boolean().optional().default(false),
});

export const updateServiceStatusSchema = joi.object({
  isDriversLicenseApproved: joi.boolean().optional(),
  drivers_license_note: joi.string().optional(),
  isCOIAApproved: joi.boolean().optional(),
  COI_note: joi.string().optional(),
  isBusinessLicenseApproved: joi.boolean().optional(),
  Business_license_note: joi.string().optional(),
  isTreeRemovalLicenseApproved: joi.boolean().optional(),
  Tree_removal_license_note: joi.string().optional(),
  isWorkersCompApproved: joi.boolean().optional(),
  Workers_comp_note: joi.string().optional(),
  Certified_arborist: joi.boolean().optional(),
  Certified_arborist_note: joi.string().optional(),
  status: joi.string().optional().valid("pending", "approved", "rejected"),
  notes: joi.string().optional().allow(""),
  reason: joi.string().optional().allow(""),
  isCOIApproved: joi.boolean().optional(),
  COI_notes: joi.string().optional(),
  isW9Approved: joi.boolean().optional(),
  W9_notes: joi.string().optional(),
  isDocsApproved: joi.boolean().optional(),
  docs_notes: joi.string().optional(),
});

const companyDocumentFields = {
  isCOIApproved: joi.boolean().optional(),
  COI_notes: joi.string().optional().allow(""),
  isW9Approved: joi.boolean().optional(),
  W9_notes: joi.string().optional().allow(""),
  isDocsApproved: joi.boolean().optional(),
  docs_notes: joi.string().optional().allow(""),
};

/** Commercial builder approve (status set by route). */
export const approveCompanySchema = joi.object({
  ...companyDocumentFields,
  isTaxExempt: joi.boolean().optional(),
});

/** Commercial builder reject — reason required. */
export const rejectCompanySchema = joi.object({
  reason: joi.string().trim().min(1).required(),
  notes: joi.string().optional().allow(""),
  ...companyDocumentFields,
  isTaxExempt: joi.boolean().optional(),
});

export const adminUpdateManualReviewRequestsSchema = joi.object({
  status: joi
    .string()
    .optional()
    .valid("pending", "accepted", "cancelled", "approved", "rejected"),
  userAcceptedStatus: joi
    .string()
    .optional()
    .valid("pending", "accepted", "cancelled"),
  notesByAdmin: joi.string().optional().allow(""),
  finalPricing: joi.object().optional(),
  price: joi.number().optional(),
  metadata: joi.object().optional(),
  reason: joi.string().optional().allow(""),
});
