export default function flattenObject(obj, prefix = "", res = {}) {
  for (let key in obj) {
    if (
      typeof obj[key] === "object" &&
      obj[key] !== null &&
      !Array.isArray(obj[key])
    ) {
      flattenObject(obj[key], prefix ? `${prefix}.${key}` : key, res);
    } else {
      res[prefix ? `${prefix}.${key}` : key] = obj[key];
    }
  }
  return res;
}
