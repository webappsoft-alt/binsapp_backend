import { extractEntitiesFromMessage, calculateFunnelStep, generateStepActionCard } from "./src/modules/sales_agent/funnel/funnelState.service.js";
import { createPrefilledCheckoutToken, getCheckoutSession } from "./src/modules/sales_agent/tools/checkoutToken.js";

console.log("=== RUNNING VERIFICATION FOR CLIENT FLOWS ===");

// TEST 1: JUNK REMOVAL FLOW (Natural language input: "I need junk removal for an old house.")
console.log("\n--- TEST 1: Junk Removal (Natural Language) ---");
let junkData = {};
let step1 = extractEntitiesFromMessage("I need junk removal for an old house.", junkData);
junkData = step1;
let funnelState1 = calculateFunnelStep("junk_removal", junkData);
console.log("1. User: 'I need junk removal for an old house.'");
console.log("   Extracted serviceType:", junkData.serviceType);
console.log("   Extracted projectDescription:", junkData.projectDescription);
console.log("   Funnel Step:", funnelState1.currentStep, "(Expected: location)");
if (funnelState1.currentStep !== "location") console.error("FAIL: Expected location");

let step2 = extractEntitiesFromMessage("75001", junkData);
junkData = step2;
let funnelState2 = calculateFunnelStep("junk_removal", junkData);
console.log("2. User: '75001'");
console.log("   Extracted zipCode:", junkData.zipCode);
console.log("   Funnel Step:", funnelState2.currentStep, "(Expected: volume)");
let card2 = generateStepActionCard("junk_removal", funnelState2.currentStep, junkData, "test1");
console.log("   Volume Card Title:", card2?.payload?.title);
console.log("   Volume Options:", card2?.payload?.options?.map(o => o.label));

let step3 = extractEntitiesFromMessage("Full Truckload", junkData);
junkData = step3;
let funnelState3 = calculateFunnelStep("junk_removal", junkData);
console.log("3. User: 'Full Truckload'");
console.log("   Extracted junkVolume:", junkData.junkVolume);
console.log("   Funnel Step:", funnelState3.currentStep, "(Expected: timing)");
let card3 = generateStepActionCard("junk_removal", funnelState3.currentStep, junkData, "test1");
console.log("   Timing Card Title:", card3?.payload?.title);

let step4 = extractEntitiesFromMessage("Tomorrow", junkData);
junkData = step4;
let funnelState4 = calculateFunnelStep("junk_removal", junkData);
console.log("4. User: 'Tomorrow'");
console.log("   Extracted deliveryDate:", junkData.deliveryDate);
console.log("   Funnel Step:", funnelState4.currentStep, "(Expected: photos)");
let card4 = generateStepActionCard("junk_removal", funnelState4.currentStep, junkData, "test1");
console.log("   Photos Card Title:", card4?.payload?.title, "Optional:", card4?.payload?.optional);

// Image upload with storage bucket URL that previously broke!
let step5 = extractEntitiesFromMessage("I uploaded project photos: https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1791375801729.jpg", junkData);
junkData = step5;
let funnelState5 = calculateFunnelStep("junk_removal", junkData);
console.log("5. User: 'I uploaded project photos: https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1791375801729.jpg'");
console.log("   Extracted serviceType:", junkData.serviceType, "(MUST REMAIN Junk Removal, NOT Dumbster!)");
console.log("   Photos count:", junkData.photos?.length);
console.log("   Funnel Step:", funnelState5.currentStep, "(Expected: checkout)");
let card5 = generateStepActionCard("junk_removal", funnelState5.currentStep, junkData, "test1");
console.log("   Final Action Card:", card5?.cardType);
console.log("   Card Title:", card5?.payload?.title, "(Expected: Request Junk Removal Service)");
console.log("   Button Text:", card5?.payload?.buttonText, "(Expected: Continue to Book)");
console.log("   Checkout URL:", card5?.payload?.checkoutUrl);

// TEST 2: TREE SERVICE FLOW (Natural language input: "A tree fell in my backyard after a storm.")
console.log("\n--- TEST 2: Tree Service (Natural Language) ---");
let treeData = {};
let tStep1 = extractEntitiesFromMessage("A tree fell in my backyard after a storm.", treeData);
treeData = tStep1;
let tFunnelState1 = calculateFunnelStep("tree_service", treeData);
console.log("1. User: 'A tree fell in my backyard after a storm.'");
console.log("   Extracted serviceType:", treeData.serviceType);
console.log("   Extracted treeNeed:", treeData.treeNeed, "(Expected: Fallen tree)");
console.log("   Extracted jobDescription:", treeData.jobDescription);
console.log("   Funnel Step:", tFunnelState1.currentStep, "(Expected: location)");

let tStep2 = extractEntitiesFromMessage("75001", treeData);
treeData = tStep2;
let tFunnelState2 = calculateFunnelStep("tree_service", treeData);
console.log("2. User: '75001'");
console.log("   Extracted zipCode:", treeData.zipCode);
console.log("   Funnel Step:", tFunnelState2.currentStep, "(Expected: timing_urgency)");
let tCard2 = generateStepActionCard("tree_service", tFunnelState2.currentStep, treeData, "test2");
console.log("   Urgency Card Title:", tCard2?.payload?.title);
console.log("   Urgency Options:", tCard2?.payload?.options?.map(o => o.label));

let tStep3 = extractEntitiesFromMessage("Emergency / Hazard", treeData);
treeData = tStep3;
let tFunnelState3 = calculateFunnelStep("tree_service", treeData);
console.log("3. User: 'Emergency / Hazard'");
console.log("   Extracted treeUrgency:", treeData.treeUrgency);
console.log("   Funnel Step:", tFunnelState3.currentStep, "(Expected: photos)");

let tStep4 = extractEntitiesFromMessage("I don't have photos right now, let's continue.", treeData);
treeData = tStep4;
let tFunnelState4 = calculateFunnelStep("tree_service", treeData);
console.log("4. User tries to skip: 'I don\\'t have photos right now, let\\'s continue.'");
console.log("   Photos skipped:", treeData.photosSkipped);
console.log("   Funnel Step:", tFunnelState4.currentStep, "(Expected: photos - skipping is blocked)");

let tStep4b = extractEntitiesFromMessage("I uploaded project photos: https://cdn.example.com/tree1.jpg https://cdn.example.com/tree2.jpg", treeData);
treeData = tStep4b;
let tFunnelState4b = calculateFunnelStep("tree_service", treeData);
console.log("5. User: 'I uploaded project photos: https://cdn.example.com/tree1.jpg https://cdn.example.com/tree2.jpg'");
console.log("   Photos count:", treeData.photos?.length);
console.log("   Funnel Step:", tFunnelState4b.currentStep, "(Expected: checkout)");
let tCard4 = generateStepActionCard("tree_service", tFunnelState4b.currentStep, treeData, "test2");
console.log("   Final Action Card:", tCard4?.cardType);
console.log("   Card Title:", tCard4?.payload?.title, "(Expected: Request Tree Service)");
console.log("   Button Text:", tCard4?.payload?.buttonText, "(Expected: Request Service)");
console.log("   Checkout URL:", tCard4?.payload?.checkoutUrl);

// TEST 3: TREE SERVICE SELECTION FROM ZERO (Client menu selection flow)
console.log("\n--- TEST 3: Tree Service (Menu Selection from Zero) ---");
let treeMenuData = { serviceType: "Tree Removal" };
let tmStep0 = calculateFunnelStep("tree_service", treeMenuData);
console.log("0. Funnel Step after selecting Tree Service:", tmStep0.currentStep, "(Expected: tree_need)");
let tmCard0 = generateStepActionCard("tree_service", tmStep0.currentStep, treeMenuData, "test3");
console.log("   Tree Need Options:", tmCard0?.payload?.options?.map(o => o.label));

let tmStep1 = extractEntitiesFromMessage("Tree trimming", treeMenuData);
treeMenuData = tmStep1;
let tmFunnel1 = calculateFunnelStep("tree_service", treeMenuData);
console.log("1. User: 'Tree trimming'");
console.log("   Funnel Step:", tmFunnel1.currentStep, "(Expected: location)");

let tmStep2 = extractEntitiesFromMessage("38000", treeMenuData);
treeMenuData = tmStep2;
let tmFunnel2 = calculateFunnelStep("tree_service", treeMenuData);
console.log("2. User gives ZIP: '38000'");
console.log("   Funnel Step:", tmFunnel2.currentStep, "(Expected: job_description)");
let tmCard2 = generateStepActionCard("tree_service", tmFunnel2.currentStep, treeMenuData, "test3");
console.log("   Job Description Options:", tmCard2?.payload?.options?.map(o => o.label));

let tmStep3 = extractEntitiesFromMessage("Backyard with standard gate access", treeMenuData);
treeMenuData = tmStep3;
let tmFunnel3 = calculateFunnelStep("tree_service", treeMenuData);
console.log("3. User: 'Backyard with standard gate access'");
console.log("   Funnel Step:", tmFunnel3.currentStep, "(Expected: timing_urgency)");

let tmStep4 = extractEntitiesFromMessage("This Week", treeMenuData);
treeMenuData = tmStep4;
let tmFunnel4 = calculateFunnelStep("tree_service", treeMenuData);
console.log("4. User: 'This Week'");
console.log("   Funnel Step:", tmFunnel4.currentStep, "(Expected: photos)");

// TEST 4: JUNK REMOVAL MENU SELECTION WITH DETECTED ZIP NOT AUTO-SKIPPING LOCATION
console.log("\n--- TEST 4: Junk Removal Location Step with detectedZip ---");
let junkMenuData = { serviceType: "Junk Removal", projectDescription: "Old house cleanout", detectedZip: "38000" };
let jmFunnel = calculateFunnelStep("junk_removal", junkMenuData);
console.log("1. After 'Old house cleanout' with detectedZip = '38000':");
console.log("   Funnel Step:", jmFunnel.currentStep, "(MUST BE location, NOT volume!)");
if (jmFunnel.currentStep !== "location") console.error("FAIL: Location step was skipped!");
else console.log("   SUCCESS: Location step correctly waiting for customer ZIP confirmation!");

let locCard = generateStepActionCard("junk_removal", jmFunnel.currentStep, junkMenuData, "test4");
console.log("   Location Card Chip:", locCard?.payload?.options?.map(o => o.label));

// TEST 5: PHOTO CARD CONSTRAINTS & CHECKOUT TOKEN PRE-ANALYSIS HYDRATION
console.log("\n--- TEST 5: Photo Card Constraints & Token Hydration ---");
let junkPhotoCard = generateStepActionCard("junk_removal", "photos", {}, "test5");
console.log("1. Junk Removal Photo Card constraints:");
console.log("   minFiles:", junkPhotoCard?.payload?.minFiles, "(Expected: 2)");
console.log("   maxFiles:", junkPhotoCard?.payload?.maxFiles, "(Expected: 2)");
if (junkPhotoCard?.payload?.minFiles !== 2 || junkPhotoCard?.payload?.maxFiles !== 2) {
  console.error("FAIL: Junk Photo Card must enforce strictly minFiles: 2 and maxFiles: 2!");
  process.exit(1);
}

let treePhotoCard = generateStepActionCard("tree_service", "photos", {}, "test5");
console.log("2. Tree Service Photo Card constraints:");
console.log("   minFiles:", treePhotoCard?.payload?.minFiles, "(Expected: 2)");
console.log("   maxFiles:", treePhotoCard?.payload?.maxFiles, "(Expected: 2)");
if (treePhotoCard?.payload?.minFiles !== 2 || treePhotoCard?.payload?.maxFiles !== 2) {
  console.error("FAIL: Tree Photo Card must enforce strictly minFiles: 2 and maxFiles: 2!");
  process.exit(1);
}

// Test checkout token hydration with junkAnalysis and treeAnalysis
const mockJunkAnalysis = {
  ai_detection: {
    estimated_cubic_yards: 4.5,
    estimated_weight_lbs: 900,
    primary_item_type: "furniture",
    confidence_score: 95,
  },
  pricing_result: {
    quote: 295,
    manual_review_required: false,
  },
};

const tokenResult = await createPrefilledCheckoutToken({
  serviceType: "Junk Removal",
  zipCode: "75001",
  junkVolume: "1/2 Truckload",
  junkAnalysis: mockJunkAnalysis,
  estimatedPrice: 295,
  photos: [
    "https://storage.googleapis.com/test-bucket/photo1.jpg",
    "https://storage.googleapis.com/test-bucket/photo2.jpg",
  ],
});

console.log("3. Created Token for Junk Removal with AI Analysis:");
console.log("   Token:", tokenResult.token);
console.log("   Has AI Analysis flag:", tokenResult.summary.hasAiAnalysis);
console.log("   Estimated Price in summary:", tokenResult.summary.estimatedPrice);

const sessionData = await getCheckoutSession(tokenResult.token);
console.log("4. Hydrated sessionData from Redis:");
console.log("   Service:", sessionData.serviceType);
console.log("   Hydrated junkAnalysis quote:", sessionData.junkAnalysis?.pricing_result?.quote);
console.log("   Hydrated photos count:", sessionData.imageUrls?.length);

if (sessionData.junkAnalysis?.pricing_result?.quote !== 295 || sessionData.imageUrls?.length !== 2) {
  console.error("FAIL: Checkout session did not hydrate pre-analyzed AI quote or photos properly!");
  process.exit(1);
} else {
  console.log("   SUCCESS: Pre-analyzed quote ($295) and photos fully hydrated into checkout session!");
}

console.log("\n--- TEST 6: Manual Review Flow & Card Generation ---");
const treeManualToken = await createPrefilledCheckoutToken({
  serviceType: "Tree Removal",
  zipCode: "38000",
  treeNeed: "Tree trimming",
  urgency: "Emergency / Hazard",
  estimatedPrice: 420,
  manualReviewRequired: true,
  manualReviewReasons: ["multiple trees, structure proximity", "Low AI image confidence score (60%)"],
});

console.log("1. Tree Service Token with Manual Review Required:");
console.log("   manualReviewRequired:", treeManualToken.summary.manualReviewRequired);
console.log("   manualReviewReasons:", treeManualToken.summary.manualReviewReasons);

if (
  treeManualToken.summary.manualReviewRequired !== true ||
  !treeManualToken.summary.manualReviewReasons.includes("multiple trees, structure proximity")
) {
  console.error("FAIL: treeManualToken summary did not flag manualReviewRequired!");
  process.exit(1);
} else {
  console.log("   SUCCESS: Tree Service checkout token accurately flagged manualReviewRequired and reasons!");
}

const treeManualCard = generateStepActionCard(
  "tree_service",
  "checkout",
  {
    zipCode: "38000",
    treeNeed: "Tree trimming",
    urgency: "Emergency / Hazard",
    estimatedPrice: 420,
    manualReviewRequired: true,
    manualReviewReasons: ["multiple trees, structure proximity"],
    photos: ["http://img1.jpg", "http://img2.jpg"],
  },
  "manual_test_session"
);

console.log("2. Generated Tree Service Step Action Card:");
console.log("   Card Title:", treeManualCard.payload.title);
console.log("   Button Text:", treeManualCard.payload.buttonText);
console.log("   Card manualReviewRequired:", treeManualCard.payload.manualReviewRequired);

if (
  treeManualCard.payload.title !== "Request Tree Service (Review Required)" ||
  treeManualCard.payload.buttonText !== "Request Arborist Review"
) {
  console.error("FAIL: Tree Service action card did not use manual review title/button text!");
  process.exit(1);
} else {
  console.log("   SUCCESS: Tree Service action card displays review required status and button!");
}

console.log("\n--- TEST 7: Provider Onboarding Flow & Image 2 Fix Verification ---");
let providerData = {};

// Step 1: User says "I want to join as a provider"
const intentEntities = extractEntitiesFromMessage("I want to join as a provider", providerData);
providerData = { ...providerData, ...intentEntities };
console.log("1. Provider intent detected:", providerData.primaryIntent);
let pStep = calculateFunnelStep("provider_onboarding", providerData);
console.log("   Current step:", pStep.currentStep);
let pCard = generateStepActionCard("provider_onboarding", pStep.currentStep, providerData, "provider_test");
const step1Options = pCard?.payload?.options || pCard?.payload?.chips || [];
console.log("   Card type:", pCard?.cardType, "Quick replies:", step1Options.map(c => c.label));

if (pStep.currentStep !== "services_offered" || !step1Options.some(c => c.label === "Dumpster Rentals")) {
  console.error("FAIL: Provider step did not start with services_offered!");
  process.exit(1);
}

// Step 2: User selects "Dumpster Rentals"
const serviceEntities = extractEntitiesFromMessage("Dumpster Rentals", providerData);
providerData = { ...providerData, ...serviceEntities };
pStep = calculateFunnelStep("provider_onboarding", providerData);
console.log("2. Service selected -> Current step:", pStep.currentStep);
pCard = generateStepActionCard("provider_onboarding", pStep.currentStep, providerData, "provider_test");

if (pStep.currentStep !== "provider_contact" || pCard?.cardType !== "lead_form") {
  console.error("FAIL: Did not progress to provider_contact with lead_form card!");
  process.exit(1);
}

// Step 3: User submits contact details
const contactEntities = extractEntitiesFromMessage(
  "Company: Titan Waste Solutions\nContact: Bob Miller\nPhone: (555) 789-0123\nEmail: bob@titanwaste.com\nZIP: 75001",
  providerData
);
providerData = { ...providerData, ...contactEntities };
console.log("3. Extracted Provider Contact:", {
  company: providerData.companyName,
  contact: providerData.contactName,
  phone: providerData.phone,
  email: providerData.email,
  zip: providerData.baseZip,
});
pStep = calculateFunnelStep("provider_onboarding", providerData);
console.log("   Progressed to:", pStep.currentStep);
pCard = generateStepActionCard("provider_onboarding", pStep.currentStep, providerData, "provider_test");

if (pStep.currentStep !== "dumpster_count") {
  console.error("FAIL: Did not progress to dumpster_count!");
  process.exit(1);
}

// Step 4: User clicks "4-10 Roll-Off Dumpsters" (Fixing Image 2 bug where it repeated)
const fleetEntities = extractEntitiesFromMessage("4-10 Roll-Off Dumpsters", providerData);
providerData = { ...providerData, ...fleetEntities };
console.log("4. User clicked '4-10 Roll-Off Dumpsters' -> Extracted:", providerData.dumpsterQuantity);
pStep = calculateFunnelStep("provider_onboarding", providerData);
console.log("   Step after dumpster count:", pStep.currentStep);

if (pStep.currentStep === "dumpster_count") {
  console.error("FAIL: Funnel is still stuck on dumpster_count (Image 2 bug occurred)!");
  process.exit(1);
} else if (pStep.currentStep !== "dumpster_sizes") {
  console.error("FAIL: Expected dumpster_sizes, got " + pStep.currentStep);
  process.exit(1);
}
console.log("   SUCCESS: Step advanced from dumpster_count to dumpster_sizes without repeating!");

// Step 5: User selects dumpster sizes
const sizeEntities = extractEntitiesFromMessage("15 yard, 20 yard, 30 yard", providerData);
providerData = { ...providerData, ...sizeEntities };
pStep = calculateFunnelStep("provider_onboarding", providerData);
console.log("5. Dumpster sizes selected -> Next step:", pStep.currentStep);
if (pStep.currentStep !== "truck_system") {
  console.error("FAIL: Expected truck_system after dumpster_sizes, got " + pStep.currentStep);
  process.exit(1);
}

// Step 6: User selects truck/system type
const truckEntities = extractEntitiesFromMessage("Hook lift truck", providerData);
providerData = { ...providerData, ...truckEntities };
pStep = calculateFunnelStep("provider_onboarding", providerData);
console.log("6. Truck system selected -> Next step:", pStep.currentStep);
if (pStep.currentStep !== "service_radius") {
  console.error("FAIL: Expected service_radius after truck_system, got " + pStep.currentStep);
  process.exit(1);
}

// Step 7: User gives service radius
const radiusEntities = extractEntitiesFromMessage("25 Miles", providerData);
providerData = { ...providerData, ...radiusEntities };
pStep = calculateFunnelStep("provider_onboarding", providerData);
console.log("7. Service radius entered -> Next step:", pStep.currentStep);
if (pStep.currentStep !== "drivers_count") {
  console.error("FAIL: Expected drivers_count after service_radius, got " + pStep.currentStep);
  process.exit(1);
}

// Step 8: User gives driver count
const driverEntities = extractEntitiesFromMessage("2-4 Drivers", providerData);
providerData = { ...providerData, ...driverEntities };
pStep = calculateFunnelStep("provider_onboarding", providerData);
console.log("8. Drivers count entered -> Next step:", pStep.currentStep, "isComplete:", pStep.isComplete);
if (pStep.currentStep !== "registration_prefill" || !pStep.isComplete) {
  console.error("FAIL: Expected registration_prefill with isComplete:true after drivers_count!");
  process.exit(1);
}

pCard = generateStepActionCard("provider_onboarding", pStep.currentStep, providerData, "provider_test");
console.log("   Action card type:", pCard?.cardType);
console.log("   Action button text:", pCard?.payload?.buttonText);
console.log("   Checkout URL:", pCard?.payload?.checkoutUrl);

if (
  pStep.currentStep !== "registration_prefill" ||
  !pStep.isComplete ||
  pCard?.payload?.buttonText !== "Continue Free Registration" ||
  !pCard?.payload?.checkoutUrl?.includes("company=Titan+Waste+Solutions")
) {
  console.error("FAIL: Provider completion did not generate prefilled registration card!");
  process.exit(1);
}

console.log("   SUCCESS: Full 5-Step Provider Onboarding Flow validated with prefill!");

// TEST 8: Logged-in Provider Existing Service Detection & Duplicate Prevention
console.log("\n--- TEST 8: Existing Service Detection & Duplicate Prevention ---");
import { getUserRegisteredServices } from "./src/modules/sales_agent/utils/userRegistration.util.js";

const mockOperatorUser = {
  _id: "660c00000000000000000001",
  name: "Marcus Aurelius",
  role: "renter",
  radius: 35,
  driving_license: "https://storage.googleapis.com/bins/dl_123.jpg",
  junkRemoval: {
    _id: "660c00000000000000000002",
    companyName: "Capitol Cleanouts LLC",
    status: "pending",
  },
};

const userRegs = getUserRegisteredServices(mockOperatorUser);
console.log("1. Detected existing registrations for logged-in operator:");
console.log("   - Dumpster Rentals:", userRegs["Dumpster Rentals"]?.statusLabel);
console.log("   - Junk Removal:", userRegs["Junk Removal"]?.statusLabel);

if (!userRegs["Dumpster Rentals"] || !userRegs["Junk Removal"]) {
  console.error("FAIL: Expected Dumpster Rentals and Junk Removal to be detected!");
  process.exit(1);
}

// 2. Action Card Quick Replies mark already registered services
const serviceCard = generateStepActionCard(
  "provider_onboarding",
  "services_offered",
  {},
  "sess_test8",
  null,
  userRegs
);

const dumpsterOpt = serviceCard?.payload?.options?.find(o => o.value === "Dumpster Rentals");
const junkOpt = serviceCard?.payload?.options?.find(o => o.value === "Junk Removal");
const treeOpt = serviceCard?.payload?.options?.find(o => o.value === "Tree Services");

console.log("2. Generated Services Offered quick replies with badges:");
console.log("   - Dumpster option label:", dumpsterOpt?.label, "disabled:", dumpsterOpt?.disabled);
console.log("   - Junk option label:", junkOpt?.label, "disabled:", junkOpt?.disabled);
console.log("   - Tree option label:", treeOpt?.label, "disabled:", treeOpt?.disabled);

if (!dumpsterOpt?.disabled || !junkOpt?.disabled || treeOpt?.disabled) {
  console.error("FAIL: Registered services must be marked and disabled in options!");
  process.exit(1);
}

// 3. User attempts duplicate registration for Junk Removal
const dupAttemptStep = calculateFunnelStep(
  "provider_onboarding",
  { servicesOffered: ["Junk Removal"] },
  userRegs
);

console.log("3. User clicked 'Junk Removal' -> Funnel step:", dupAttemptStep.currentStep);
console.log("   Duplicate service detected:", dupAttemptStep.duplicateService);
console.log("   Current status:", dupAttemptStep.duplicateStatus);

if (dupAttemptStep.currentStep !== "already_registered" || dupAttemptStep.duplicateService !== "Junk Removal") {
  console.error("FAIL: Expected step already_registered for duplicate service selection!");
  process.exit(1);
}

// 4. Action card informs user of existing registration and status
const dupNoticeCard = generateStepActionCard(
  "provider_onboarding",
  dupAttemptStep.currentStep,
  dupAttemptStep,
  "sess_test8",
  null,
  userRegs
);

console.log("4. Already Registered Action Card:");
console.log("   Title:", dupNoticeCard?.payload?.title);
console.log("   Description:", dupNoticeCard?.payload?.description);

if (
  !dupNoticeCard?.payload?.title?.includes("already registered for Junk Removal") ||
  !dupNoticeCard?.payload?.description?.includes("Application Pending")
) {
  console.error("FAIL: Action card does not display duplicate prevention and status notice!");
  process.exit(1);
}

console.log("   SUCCESS: Existing service detection & duplicate prevention fully verified!");

// TEST 9: Low AI Confidence (< 50%) Image Re-upload Flow
console.log("\n--- TEST 9: Low AI Confidence (< 50%) Image Re-upload Flow ---");
// Simulate session with low confidence photos
let lowConfData = {
  serviceType: "Junk Removal",
  projectDescription: "Basement cleanout",
  zipCode: "75001",
  junkVolume: "1/2 Truckload",
  deliveryDate: "2026-10-18",
  lowConfidence: true,
  confidenceScore: 38,
  lowConfidenceReason: "Image confidence score was 38%, which is below the 50% threshold for accurate automated quotes.",
};

let lowConfStep = calculateFunnelStep("junk_removal", lowConfData);
console.log("1. Step with lowConfidence = true:");
console.log("   Funnel Step:", lowConfStep.currentStep, "(Expected: photos)");
if (lowConfStep.currentStep !== "photos") {
  console.error("FAIL: Low confidence images must keep funnel on photos step!");
  process.exit(1);
}

let reuploadCard = generateStepActionCard("junk_removal", lowConfStep.currentStep, lowConfData, "sess_test9");
console.log("2. Re-upload Action Card:");
console.log("   Card Title:", reuploadCard?.payload?.title, "(Expected: Please Upload 2 Clearer Photos)");
console.log("   isReupload:", reuploadCard?.payload?.isReupload, "(Expected: true)");
console.log("   confidenceScore:", reuploadCard?.payload?.confidenceScore, "(Expected: 38)");

if (
  reuploadCard?.payload?.title !== "Please Upload 2 Clearer Photos" ||
  reuploadCard?.payload?.isReupload !== true ||
  reuploadCard?.payload?.confidenceScore !== 38
) {
  console.error("FAIL: Re-upload action card must indicate clearer photos are required with confidence score!");
  process.exit(1);
}
console.log("   SUCCESS: Low confidence photo re-upload card generated correctly!");

// 3. User re-uploads with high confidence (e.g. 85%)
let highConfData = {
  ...lowConfData,
  photos: ["https://storage.googleapis.com/test/photo1.jpg", "https://storage.googleapis.com/test/photo2.jpg"],
  photosProvided: true,
};
delete highConfData.lowConfidence;
delete highConfData.confidenceScore;
delete highConfData.lowConfidenceReason;
highConfData.junkAnalysis = {
  ai_detection: { confidence_score: 85, estimated_cubic_yards: 3 },
  pricing_result: { quote: 245, manual_review_required: false },
};

let highConfStep = calculateFunnelStep("junk_removal", highConfData);
console.log("3. Step after clearer photos uploaded (confidence 85%):");
console.log("   Funnel Step:", highConfStep.currentStep, "(Expected: checkout)");
if (highConfStep.currentStep !== "checkout") {
  console.error("FAIL: High confidence re-upload must advance to checkout!");
  process.exit(1);
}
console.log("   SUCCESS: High confidence re-upload cleanly advanced to checkout!");

console.log("\n=== ALL FLOW TESTS COMPLETED SUCCESSFULLY ===");
process.exit(0);

