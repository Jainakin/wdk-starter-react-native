/**
 * Test setup file
 * Mocks bare-crypto to use Node's crypto for testing in Node.js environment
 */

// Mock bare-crypto to use Node's crypto for testing
// This allows tests to run in Node.js without requiring Bare runtime
if (typeof require !== 'undefined') {
  const nodeCrypto = require('crypto')
  
  // Create a mock bare-crypto that uses Node's crypto
  const mockBareCrypto = {
    randomBytes: (size) => nodeCrypto.randomBytes(size),
    createCipheriv: (algorithm, key, iv) => nodeCrypto.createCipheriv(algorithm, key, iv),
    createDecipheriv: (algorithm, key, iv) => nodeCrypto.createDecipheriv(algorithm, key, iv),
    createCipherGCM: (algorithm, key, iv) => {
      // For GCM mode, Node's crypto uses createCipheriv with 'aes-256-gcm'
      const cipher = nodeCrypto.createCipheriv(algorithm, key, iv)
      return cipher
    },
    createDecipherGCM: (algorithm, key, iv, authTag) => {
      const decipher = nodeCrypto.createDecipheriv(algorithm, key, iv)
      if (authTag) {
        decipher.setAuthTag(authTag)
      }
      return decipher
    }
  }
  
  // Override require for bare-crypto in test environment
  const Module = require('module')
  const originalRequire = Module.prototype.require
  
  Module.prototype.require = function (id) {
    if (id === 'bare-crypto') {
      return mockBareCrypto
    }
    return originalRequire.apply(this, arguments)
  }
}

