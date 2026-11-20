/**
 * Tiny mustache-style renderer used by admin templates.
 *
 *   {{name}}                    → value of vars.name (dot paths allowed: {{customer.name}})
 *   {{#items}} … {{/items}}     → repeated for each entry of an array (inner {{field}} reads the entry)
 *   {{#flag}} … {{/flag}}       → shown when vars.flag is truthy (non-array)
 *   {{^flag}} … {{/flag}}       → shown when vars.flag is falsy / empty array
 *
 * Unknown variables render as an empty string so a template never leaks "{{…}}" to a customer.
 */
const lookup = (vars, path) =>
  String(path)
    .split(".")
    .reduce((acc, part) => (acc == null ? undefined : acc[part]), vars);

const SECTION = /\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g;

export function renderTemplateString(template, vars = {}) {
  if (!template) return "";
  let out = String(template);

  out = out.replace(SECTION, (_, type, name, inner) => {
    const value = lookup(vars, name);
    const empty = value == null || value === false || value === "" || (Array.isArray(value) && value.length === 0);
    if (type === "^") return empty ? renderTemplateString(inner, vars) : "";
    if (empty) return "";
    if (Array.isArray(value)) {
      return value
        .map((item, index) =>
          renderTemplateString(inner, {
            ...vars,
            ...(item && typeof item === "object" ? item : { value: item }),
            index: index + 1,
          }),
        )
        .join("");
    }
    return renderTemplateString(inner, vars);
  });

  return out.replace(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g, (_, name) => {
    const value = lookup(vars, name);
    return value == null ? "" : String(value);
  });
}

/** Variable names referenced by a template (for the editor's variable list). */
export function extractTemplateVariables(template) {
  const names = new Set();
  const re = /\{\{[#^/]?\s*([\w.]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(template || "")))) names.add(m[1]);
  return [...names];
}
