export {
  SALES_TOOLS_DEFINITIONS,
  checkServiceCoverageTool,
  captureLeadProfileTool,
  generatePrefilledCheckoutTool,
  escalateToHumanOrCommercialTool,
} from "./definitions.js";

export {
  validateToolArguments,
  checkServiceCoverageArgsSchema,
  captureLeadProfileArgsSchema,
  generatePrefilledCheckoutArgsSchema,
  escalateToHumanOrCommercialArgsSchema,
} from "./validation.js";

export {
  createPrefilledCheckoutToken,
  getCheckoutSession,
  getServiceRouteSlug,
} from "./checkoutToken.js";

export {
  executeToolCall,
  handleCheckServiceCoverage,
  handleCaptureLeadProfile,
  handleGeneratePrefilledCheckout,
  handleEscalateToHumanOrCommercial,
} from "./handlers.js";

export {
  resolveZipCoordinates,
  checkRealServiceAvailability,
  checkRealDumpsterAvailability,
  checkRealPortaPottyAvailability,
  checkRealJunkRemovalAvailability,
  checkRealTreeRemovalAvailability,
} from "../services/realAvailability.service.js";
