const ERROR_CODES = require('./error-codes')
const { safeStringify } = require('../utils/safe-stringify')

/**
 * @typedef {Object} rpcExceptionPayload
 * @property {ERROR_CODES} [code=ERROR_CODES.UNKNOWN] - Error code
 * @property {string} [message="Unexpected error occurred"] - Error message
 * @property {any} error - Original exception itself
 */

/**
 * @typedef {Object} rpcExceptionResponse
 * @property {ERROR_CODES} code - Error code
 * @property {string} message - Error message
 * @property {string} error - Original exception converted to string
 */

/**
 * Check if we're in development mode
 * @returns {boolean} True if in development mode
 */
function isDevelopmentMode () {
  // Check for common development indicators
  return typeof process !== 'undefined' && (
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG === '1' ||
    process.env.DEBUG === 'true'
  )
}

/**
 * Sanitize error message to prevent information leakage
 * Only includes stack traces in development mode
 * @param {Error|any} error - Error to stringify
 * @returns {string} Sanitized error string
 */
function stringifyError (error) {
  if (error instanceof Error) {
    if (isDevelopmentMode()) {
      // Include full stack trace in development
      return `${error.message}: ${error.stack}`
    } else {
      // Only include message in production
      return error.message
    }
  }

  try {
    return safeStringify(error)
  } catch {
    return String(error)
  }
}

/**
 * Converts an error payload to a JSON string representing a rpcExceptionResponse.
 *
 * @param {rpcExceptionPayload} payload
 * @returns {string} JSON string of rpcExceptionResponse object.
 * @see rpcExceptionResponse
 */
function rpcException (payload) {
  return {
    code: payload.code ? payload.code : ERROR_CODES.UNKNOWN,
    message: payload.message ? payload.message : 'Unexpected error occurred.',
    error: stringifyError(payload.error)
  }
}

/**
 * Create a structured error response that preserves error codes and metadata
 * @param {Error|any} error - The error object
 * @param {ERROR_CODES} [code] - Optional error code, will be inferred if not provided
 * @param {string} [message] - Optional custom message
 * @returns {rpcExceptionResponse} Structured error response
 */
function createStructuredError (error, code, message) {
  // Infer error code from error type if not provided
  if (!code) {
    if (error instanceof TypeError) {
      code = ERROR_CODES.BAD_REQUEST
    } else if (error.message && error.message.includes('WDK')) {
      code = ERROR_CODES.WDK_MANAGER_INIT
    } else if (error.message && error.message.includes('balance')) {
      code = ERROR_CODES.ACCOUNT_BALANCES
    } else {
      code = ERROR_CODES.UNKNOWN
    }
  }

  return {
    code,
    message: message || (error instanceof Error ? error.message : String(error)),
    error: stringifyError(error)
  }
}

module.exports = {
  rpcException,
  stringifyError,
  createStructuredError,
  isDevelopmentMode
}
