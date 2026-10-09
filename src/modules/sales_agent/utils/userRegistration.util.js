/**
 * Backend utility to inspect a User document and determine all existing service registrations.
 *
 * Rules:
 * - Dumpster Operator: If user has radius (> 0) or role/type 'renter' or driving license.
 * - Junk Removal: If user.junkRemoval exists or access_types === 'junkRemoval'.
 * - Tree Services: If user.treeRemoval exists or access_types === 'treeRemoval'.
 * - Portable Sanitation: If user.portaPotty exists or access_types === 'portaPotty' or PortaPotty counts > 0.
 *
 * @param {Object} user - Populated User document from MongoDB
 * @returns {Record<string, { serviceName: string, serviceKey: string, status: string, statusLabel: string, raw: any }>}
 */
export function getUserRegisteredServices(user) {
  if (!user || typeof user !== "object") return {};

  const registrations = {};

  // 1. Dumpster Operator
  const isDumpsterOperator = Boolean(
    (user.role === "renter" || user.type === "renter") ||
    (user.driving_license && user.radius != null) ||
    (user.radius != null && Number(user.radius) > 0 && user.role !== "rentee" && user.type !== "rentee")
  );

  if (isDumpsterOperator) {
    registrations["Dumpster Rentals"] = {
      serviceName: "Dumpster Rentals",
      serviceKey: "dumpster",
      status: "approved",
      statusLabel: "Active / Approved",
      raw: { radius: user.radius, role: user.role || user.type },
    };
  }

  // 2. Junk Removal
  const junkObj = user.junkRemoval;
  const isJunkRegistered = Boolean(
    junkObj && (typeof junkObj === "string" || junkObj._id || junkObj.companyName || junkObj.status)
  ) || user.access_types === "junkRemoval";

  if (isJunkRegistered) {
    const rawStatus =
      (typeof junkObj === "object" && junkObj?.status) ||
      (user.access_types === "junkRemoval" ? "approved" : "pending");
    registrations["Junk Removal"] = {
      serviceName: "Junk Removal",
      serviceKey: "junk-removal",
      status: rawStatus,
      statusLabel:
        rawStatus === "approved"
          ? "Active / Approved"
          : rawStatus === "rejected"
          ? "Needs Updates / Rejected"
          : "Application Pending",
      raw: junkObj,
    };
  }

  // 3. Tree Services
  const treeObj = user.treeRemoval;
  const isTreeRegistered = Boolean(
    treeObj && (typeof treeObj === "string" || treeObj._id || treeObj.companyName || treeObj.status)
  ) || user.access_types === "treeRemoval";

  if (isTreeRegistered) {
    const rawStatus =
      (typeof treeObj === "object" && treeObj?.status) ||
      (user.access_types === "treeRemoval" ? "approved" : "pending");
    registrations["Tree Services"] = {
      serviceName: "Tree Services",
      serviceKey: "tree-services",
      status: rawStatus,
      statusLabel:
        rawStatus === "approved"
          ? "Active / Approved"
          : rawStatus === "rejected"
          ? "Needs Updates / Rejected"
          : "Application Pending",
      raw: treeObj,
    };
  }

  // 4. Portable Sanitation
  const portaObj = user.portaPotty;
  const isPortaRegistered = Boolean(
    portaObj && (typeof portaObj === "string" || portaObj._id || portaObj.status)
  ) ||
  user.access_types === "portaPotty" ||
  Boolean(Number(user.PortaPottypendingCount) > 0 || Number(user.PortaPottyverifyCount) > 0);

  if (isPortaRegistered) {
    let rawStatus = typeof portaObj === "object" ? portaObj?.status : null;
    if (!rawStatus) {
      if (Number(user.PortaPottyverifyCount) > 0 || user.access_types === "portaPotty") {
        rawStatus = "approved";
      } else {
        rawStatus = "pending";
      }
    }
    registrations["Portable Sanitation"] = {
      serviceName: "Portable Sanitation",
      serviceKey: "porta-potty",
      status: rawStatus,
      statusLabel:
        rawStatus === "approved"
          ? "Active / Approved"
          : rawStatus === "rejected"
          ? "Needs Updates / Rejected"
          : "Application Pending",
      raw: portaObj,
    };
  }

  return registrations;
}
