/**
 * Standard JSON error body for mobile clients (message, error, msg).
 */
export function buildErrorBody(statusCode, code, message, extra = {}) {
  return {
    success: false,
    code,
    message,
    error: message,
    msg: message,
    status: statusCode,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

export function sendErrorResponse(res, statusCode, code, message, extra = {}) {
  return res.status(statusCode).json(buildErrorBody(statusCode, code, message, extra));
}
