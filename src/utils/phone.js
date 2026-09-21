/**
 * Normalize phone to E.164 where possible.
 * Pakistan local: 03117384180 -> +923117384180
 */
export function normalizePhone(phone) {
  let p = String(phone || "")
    .trim()
    .replace(/[\s\-().]/g, "");
  if (!p) return "";
  if (!p.startsWith("+")) {
    if (p.startsWith("0092") && p.length >= 13) {
      p = `+${p.slice(2)}`;
    } else if (p.startsWith("00") && p.length > 4) {
      p = `+${p.slice(2)}`;
    } else if (p.length === 10 && p.startsWith("3")) {
      p = `+92${p}`;
    } else if (p.length === 11 && p.startsWith("03")) {
      p = `+92${p.slice(1)}`;
    } else if (p.length === 10) {
      p = `+1${p}`;
    } else if (p.length === 11 && p.startsWith("1")) {
      p = `+${p}`;
    } else if (p.startsWith("92") && p.length >= 12) {
      p = `+${p}`;
    }
  }
  return p;
}

/** Common stored formats for the same number. */
export function phoneLookupVariants(phone) {
  const normalized = normalizePhone(phone);
  const variants = new Set([normalized, String(phone || "").trim()]);
  if (normalized.startsWith("+1") && normalized.length === 12) {
    variants.add(normalized.slice(2));
    variants.add(normalized.slice(1));
  }
  if (normalized.startsWith("+92")) {
    const local = normalized.slice(3);
    variants.add(local);
    variants.add(`0${local}`);
  }
  return [...variants].filter(Boolean);
}
