/**
 * Safely stringify an object that may contain BigInt values
 * Converts BigInt values to strings to avoid serialization errors
 * @param {any} obj - Object to stringify
 * @returns {string} JSON string with BigInt values converted to strings
 */
function safeStringify (obj) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString()
    }
    return value
  })
}

module.exports = {
  safeStringify
}

