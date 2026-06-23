// External dependencies
const crypto = require('bare-crypto')

/**
 * Buffer Type Strategy:
 * - Functions accept both Buffer and Uint8Array for flexibility
 * - Internally convert to Buffer for crypto operations (Node.js standard)
 * - Uint8Array is used for entropy operations (required by @scure/bip39)
 * - All conversions are handled transparently within this module
 */

/**
 * Securely zero out sensitive memory (memzero)
 * Note: In JavaScript/V8, this may not be fully effective due to garbage collection
 * and memory management, but it's still good practice for security-sensitive code.
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer - Buffer to zero out
 */
const memzero = (buffer) => {
  if (!buffer) return
  
  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0)
  } else if (buffer instanceof Uint8Array) {
    buffer.fill(0)
  } else if (buffer instanceof ArrayBuffer) {
    new Uint8Array(buffer).fill(0)
  } else if (buffer.buffer instanceof ArrayBuffer) {
    // Handle TypedArray views
    new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).fill(0)
  }
}

/**
 * Generate a strong encryption key (32 bytes for AES-256)
 * @returns {string} Base64-encoded encryption key
 */
const generateEncryptionKey = () => {
  const key = crypto.randomBytes(32)
  const keyBase64 = key.toString('base64')
  memzero(key)
  return keyBase64
}

/**
 * Encrypt data using AES-256-GCM
 * @param {Uint8Array|Buffer} data - Data to encrypt
 * @param {string} keyBase64 - Base64-encoded encryption key
 * @returns {string} Base64-encoded encrypted data with IV and auth tag
 */
const encrypt = (data, keyBase64) => {
  const key = Buffer.from(keyBase64, 'base64')
  const iv = crypto.randomBytes(12) // 96-bit IV for GCM
  
  // Convert data to Buffer if needed
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
  
  // Use AES-256-GCM for authenticated encryption
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()])
  const authTag = cipher.getAuthTag()
  
  // Combine IV + encrypted data + auth tag
  const result = Buffer.concat([iv, encrypted, authTag])
  const resultBase64 = result.toString('base64')
  
  // Zero out sensitive buffers (caller should zero input data buffer)
  memzero(key)
  memzero(iv)
  memzero(encrypted)
  memzero(authTag)
  
  return resultBase64
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedBase64 - Base64-encoded encrypted data with IV and auth tag
 * @param {string} keyBase64 - Base64-encoded encryption key
 * @returns {Buffer} Decrypted data
 */
const decrypt = (encryptedBase64, keyBase64) => {
  const key = Buffer.from(keyBase64, 'base64')
  const encryptedBuffer = Buffer.from(encryptedBase64, 'base64')
  
  // Extract IV (12 bytes), encrypted data, and auth tag (16 bytes)
  const iv = encryptedBuffer.subarray(0, 12)
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16)
  const encrypted = encryptedBuffer.subarray(12, encryptedBuffer.length - 16)
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  
  // Zero out sensitive buffers (but not the decrypted result we're returning)
  memzero(key)
  memzero(encryptedBuffer)
  memzero(iv)
  memzero(authTag)
  memzero(encrypted)
  
  return decrypted
}

/**
 * Generate entropy for a seed phrase
 * @param {number} wordCount - Number of words (12 or 24)
 * @returns {Uint8Array} Entropy bytes
 */
const generateEntropy = (wordCount) => {
  if (wordCount !== 12 && wordCount !== 24) {
    throw new Error('Word count must be 12 or 24')
  }
  // 12 words = 128 bits, 24 words = 256 bits
  const entropyLength = wordCount === 12 ? 16 : 32
  const entropyBuffer = crypto.randomBytes(entropyLength)
  // Create a new Uint8Array and copy bytes explicitly for @scure/bip39 compatibility
  const entropy = new Uint8Array(entropyLength)
  entropy.set(entropyBuffer)
  // Zero out the original buffer
  memzero(entropyBuffer)
  return entropy
}

/**
 * Encrypt seed and entropy with a new encryption key
 * @param {Uint8Array|Buffer} seed - Seed bytes to encrypt
 * @param {Uint8Array|Buffer} entropy - Entropy bytes to encrypt
 * @returns {Object} Object containing encryptionKey, encryptedSeedBuffer, and encryptedEntropyBuffer
 */
const encryptSecrets = (seed, entropy) => {
  // Generate encryption key
  const encryptionKey = generateEncryptionKey()
  
  // Convert to buffers if needed
  const seedBuffer = Buffer.isBuffer(seed) ? seed : Buffer.from(seed)
  const entropyBuffer = Buffer.isBuffer(entropy) ? entropy : Buffer.from(entropy)
  
  // Encrypt both secrets
  const encryptedSeedBuffer = encrypt(seedBuffer, encryptionKey)
  const encryptedEntropyBuffer = encrypt(entropyBuffer, encryptionKey)
  
  // Zero out sensitive buffers
  memzero(seedBuffer)
  memzero(entropyBuffer)
  
  return {
    encryptionKey,
    encryptedSeedBuffer,
    encryptedEntropyBuffer
  }
}

module.exports = {
  memzero,
  generateEncryptionKey,
  encrypt,
  decrypt,
  generateEntropy,
  encryptSecrets
}

