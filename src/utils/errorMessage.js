/**
 * Turn any thrown value into a human-readable string for API responses.
 * Prevents "[object Object]" when callers pass raw Twilio/Axios payloads.
 */
export function toErrorMessage(value, fallback = "An unexpected error occurred") {
  if (value == null || value === "") return fallback;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Error) {
    return toErrorMessage(value.message, fallback);
  }

  if (typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) {
      const code = value.twilioCode ?? value.code;
      if (typeof code === "number" && !String(value.message).includes(String(code))) {
        return `Error ${code}: ${value.message}`;
      }
      return value.message.trim();
    }

    if (typeof value.twilioMessage === "string" && value.twilioMessage.trim()) {
      const code = value.twilioCode ?? value.code;
      const hint = value.hint ? ` — ${value.hint}` : "";
      return typeof code === "number"
        ? `Twilio error ${code}: ${value.twilioMessage}${hint}`
        : `${value.twilioMessage}${hint}`;
    }

    if (typeof value.code === "number" && typeof value.message === "string") {
      return `Twilio error ${value.code}: ${value.message}`;
    }

    if (Array.isArray(value.errors) && value.errors[0]?.message) {
      return toErrorMessage(value.errors[0].message, fallback);
    }

    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}") return json;
    } catch {
      // ignore
    }
  }

  return fallback;
}

export function twilioFieldsFromUnknown(value) {
  if (!value || typeof value !== "object") return null;

  const source =
    value.twilio ??
    (typeof value.twilioCode === "number" || typeof value.twilioMessage === "string"
      ? value
      : typeof value.code === "number" && typeof value.message === "string"
        ? {
            httpStatus: value.status ?? value.httpStatus ?? null,
            code: value.code,
            message: value.message,
            moreInfo: value.more_info ?? value.moreInfo ?? null,
          }
        : null);

  if (!source) return null;

  return {
    httpStatus: source.httpStatus ?? source.status ?? null,
    code: source.code ?? source.twilioCode ?? null,
    message: source.message ?? source.twilioMessage ?? null,
    moreInfo: source.moreInfo ?? source.more_info ?? null,
    hint: source.hint ?? null,
  };
}
