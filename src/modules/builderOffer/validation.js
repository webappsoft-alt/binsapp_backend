import Joi from "joi";
import {
  BUILDER_ADVANCE_NOTICE_OPTIONS,
  BUILDER_EXCHANGE_MODES,
  BUILDER_EXCHANGE_TURNAROUND_OPTIONS,
  BUILDER_FINAL_PICKUP_MODES,
  BUILDER_OFFER_LINE_TYPES,
  BUILDER_OFFER_SERVICE_TYPES,
  COMMERCIAL_LINE_UNIT_KEYS,
  unitKeysForService,
} from "../../constants/builderOffer.js";

const lineUnitKeys = [...COMMERCIAL_LINE_UNIT_KEYS];
const lineTypes = [...BUILDER_OFFER_LINE_TYPES];

const geoPoint = Joi.object({
  type: Joi.string().valid("Point").required(),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
}).optional().allow(null);

const pricingItem = Joi.object({
  key: Joi.string(),
  label: Joi.string().allow("", null),
  size: Joi.string()
    .valid(...lineUnitKeys)
    .allow(null),
  jobsiteId: Joi.string().allow(null, ""),
  lineType: Joi.string().valid(...lineTypes),
  unitBuilderPrice: Joi.number().min(0).required(),
  feeEligible: Joi.boolean(),
});

const offerLine = Joi.object({
  jobsiteId: Joi.string().required(),
  size: Joi.string()
    .valid(...lineUnitKeys)
    .required(),
  quantity: Joi.number().integer().min(1),
  deliveryDate: Joi.date().iso().required(),
  deliveryWindow: Joi.string().allow("", null),
  rentalDays: Joi.number().integer().min(1),
  unitBuilderPrice: Joi.number().min(0),
  lineBuilderTotal: Joi.number().min(0),
  lineType: Joi.string().valid(...lineTypes),
  feeEligible: Joi.boolean(),
  projectName: Joi.string().allow("", null),
  jobNumber: Joi.string().allow("", null),
  poNumber: Joi.string().allow("", null),
  costCode: Joi.string().allow("", null),
  billingReference: Joi.string().allow("", null),
  communityName: Joi.string().allow("", null),
  division: Joi.string().allow("", null),
  authorizedUsers: Joi.string().allow("", null),
  serviceInstructions: Joi.string().allow("", null),
  gateAccessInstructions: Joi.string().allow("", null),
  deliveryRestrictions: Joi.string().allow("", null),
  hoursAllowedOnsite: Joi.string().allow("", null),
  materialRestrictions: Joi.string().allow("", null),
  material: Joi.string().allow("", null),
  materialOther: Joi.string().allow("", null),
  materialPhotoUrl: Joi.string().allow("", null),
  placementContactPhone: Joi.string().allow("", null),
  placementInstructions: Joi.string().allow("", null),
  placementPhotoUrl: Joi.string().allow("", null),
  placementLabel: Joi.string().allow("", null),
  placementGeo: geoPoint,
  siteContactName: Joi.string().allow("", null),
  siteContactPhone: Joi.string().allow("", null),
});

export const createOfferValidation = Joi.object({
  title: Joi.string().allow("", null),
  regionLabel: Joi.string().allow("", null),
  fulfillmentPreference: Joi.string().valid(
    "single_provider",
    "multiple_providers",
  ),
  serviceType: Joi.string().valid(...BUILDER_OFFER_SERVICE_TYPES),
  rentalPeriodDays: Joi.number().integer().min(1),
  material: Joi.string().allow("", null),
  materialOther: Joi.string().allow("", null),
  materialPhotoUrl: Joi.string().allow("", null),
  includedTonnage: Joi.number().allow(null),
  additionalTonnageRate: Joi.number().min(0).allow(null),
  additionalDayRate: Joi.number().min(0).allow(null),
  exchangeRequirements: Joi.string().allow("", null),
  estimatedRecurringVolume: Joi.string().allow("", null),
  advanceNotice: Joi.string()
    .valid(...BUILDER_ADVANCE_NOTICE_OPTIONS)
    .allow(null),
  deliveryWindow: Joi.string().allow("", null),
  exchangeMode: Joi.string()
    .valid(...BUILDER_EXCHANGE_MODES)
    .allow(null),
  exchangeEveryDays: Joi.number().integer().min(1).allow(null),
  exchangeTurnaround: Joi.string()
    .valid(...BUILDER_EXCHANGE_TURNAROUND_OPTIONS)
    .allow(null),
  exchangeTurnaroundCustom: Joi.string().allow("", null),
  exchangeTurnaroundDate: Joi.date().iso().allow(null),
  finalPickupMode: Joi.string()
    .valid(...BUILDER_FINAL_PICKUP_MODES)
    .allow(null),
  finalPickupDate: Joi.date().iso().allow(null),
  authorizedPickupName: Joi.string().allow("", null),
  authorizedPickupPhone: Joi.string().allow("", null),
  placementContactPhone: Joi.string().allow("", null),
  eachServiceIsSeparateOrder: Joi.boolean(),
  submit: Joi.boolean(),
  sourceBlanketPlanId: Joi.string().allow("", null),
  pricingSchedule: Joi.array().items(pricingItem),
  lines: Joi.array().items(offerLine).min(1).required(),
}).custom((value, helpers) => {
  const serviceType = value.serviceType || "dumpster";
  const allowed = new Set(unitKeysForService(serviceType));
  for (const line of value.lines || []) {
    if (line.size && !allowed.has(line.size)) {
      return helpers.message(
        `Line size "${line.size}" is not valid for serviceType "${serviceType}"`,
      );
    }
  }
  if (
    value.material === "Other" &&
    !(value.materialOther && String(value.materialOther).trim())
  ) {
    return helpers.message("materialOther is required when material is Other");
  }
  if (value.exchangeMode === "automatic" && !value.exchangeEveryDays) {
    return helpers.message(
      "exchangeEveryDays is required when exchangeMode is automatic",
    );
  }
  if (
    value.exchangeTurnaround === "scheduled_day" &&
    !value.exchangeTurnaroundDate
  ) {
    return helpers.message(
      "exchangeTurnaroundDate is required when exchangeTurnaround is scheduled_day",
    );
  }
  if (
    value.finalPickupMode === "scheduled_end_date" &&
    !value.finalPickupDate
  ) {
    return helpers.message(
      "finalPickupDate is required when finalPickupMode is scheduled_end_date",
    );
  }
  if (value.finalPickupMode === "authorized_user") {
    if (
      !(value.authorizedPickupName && String(value.authorizedPickupName).trim())
    ) {
      return helpers.message(
        "authorizedPickupName is required when finalPickupMode is authorized_user",
      );
    }
    if (
      !(
        value.authorizedPickupPhone &&
        String(value.authorizedPickupPhone).trim()
      )
    ) {
      return helpers.message(
        "authorizedPickupPhone is required when finalPickupMode is authorized_user",
      );
    }
  }
  return value;
});

export const acceptPortionValidation = Joi.object({
  mode: Joi.string().valid("full_available", "select_quantity").required(),
  selections: Joi.array().items(
    Joi.object({
      lineId: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required(),
    }),
  ),
});

export const quickOrderValidation = Joi.object({
  jobsiteId: Joi.string().required(),
  size: Joi.string()
    .valid(...lineUnitKeys)
    .required(),
  quantity: Joi.number().integer().min(1).default(1),
  deliveryDate: Joi.date().iso().required(),
  rentalDays: Joi.number().integer().min(1),
  rentalPeriodDays: Joi.number().integer().min(1),
  material: Joi.string().allow("", null),
  title: Joi.string().allow("", null),
  regionLabel: Joi.string().allow("", null),
  serviceType: Joi.string().valid(...BUILDER_OFFER_SERVICE_TYPES),
  fulfillmentPreference: Joi.string().valid(
    "single_provider",
    "multiple_providers",
  ),
});

export const counterValidation = Joi.object({
  message: Joi.string().allow("", null),
  lines: Joi.array()
    .items(
      Joi.object({
        lineId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
        requestedUnitPrice: Joi.number().min(0).required(),
      }),
    )
    .min(1)
    .required(),
});
