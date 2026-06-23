// External dependencies
const { entropyToMnemonic, mnemonicToSeedSync, mnemonicToEntropy } = require('@scure/bip39')
const { wordlist } = require('@scure/bip39/wordlists/english')

// Internal dependencies - utilities
const logger = require('./utils/logger')
const { safeStringify } = require('./utils/safe-stringify')
const { validateNonEmptyString, validateNonNegativeInteger, validateBase64, validateJSON, validateMnemonic, validateWordCount } = require('./utils/validation')
const { memzero, decrypt, generateEntropy, encryptSecrets } = require('./utils/crypto')

// Internal dependencies - exceptions
const ERROR_CODES = require('./exceptions/error-codes')
const rpcException = require('./exceptions/rpc-exception')

/**
 * Create an error with a specific error code
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @returns {Error} Error object with code property
 */
const createErrorWithCode = (message, code) => {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * Unified validation utility that validates request object and wraps validation errors with error code
 * @param {any} request - Request to validate
 * @param {Function} validationFn - Validation function to execute
 * @param {string} fieldName - Name of the field for error messages (default: 'Request')
 * @throws {Error} With BAD_REQUEST code if validation fails
 */
const validateRequest = (request, validationFn, fieldName = 'Request') => {
  // Validate that request is a non-null object
  if (!request || typeof request !== 'object') {
    const error = new Error(`${fieldName} must be an object`)
    error.code = ERROR_CODES.BAD_REQUEST
    throw error
  }
  
  // Execute validation function and wrap errors with BAD_REQUEST code
  try {
    validationFn()
  } catch (error) {
    if (!error.code) {
      error.code = ERROR_CODES.BAD_REQUEST
    }
    throw error
  }
}

/**
 * Wrapper for RPC handlers that provides structured error handling
 * Preserves error codes and metadata instead of converting to plain strings
 * @param {Function} handler - The async handler function
 * @param {ERROR_CODES} [defaultErrorCode] - Optional default error code
 * @returns {Function} Wrapped handler with error handling
 */
const withErrorHandling = (handler, defaultErrorCode) => {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      // Create structured error response
      const structuredError = rpcException.createStructuredError(error, defaultErrorCode)
      // Throw as Error with structured data in message (for RPC transport)
      // The RPC layer will handle serialization
      const errorMessage = JSON.stringify(structuredError)
      throw new Error(errorMessage)
    }
  }
}

/**
 * Generalized function to call any WDK account method
 * This provides a dev-friendly way to call account methods without needing individual handlers
 * 
 * @param {Object} context - Context object containing wdk instance
 * @param {string} methodName - The method name to call on the account (e.g., 'getAddress', 'getBalance')
 * @param {string} network - Network name (e.g., 'ethereum', 'spark')
 * @param {number} accountIndex - Account index
 * @param {any} args - Arguments to pass to the method
 * @param {object} options - Optional configuration
 * @param {function} options.transformResult - Optional function to transform the result
 * @param {any} options.defaultValue - Default value to return if method doesn't exist
 * @returns {Promise<any>} The result from the account method
 */
const callWdkMethod = async (context, methodName, network, accountIndex, args = null, options = {}) => {
  const { wdk } = context
  
  if (!wdk) {
    throw createErrorWithCode('WDK not initialized. Call initializeWDK first.', ERROR_CODES.WDK_MANAGER_INIT)
  }
  
  // Validate network parameter
  if (!network || typeof network !== 'string' || network.trim().length === 0) {
    throw createErrorWithCode('Network must be a non-empty string', ERROR_CODES.BAD_REQUEST)
  }
  
  let account
  try {
    account = await wdk.getAccount(network, accountIndex)
  } catch (error) {
    throw createErrorWithCode(
      `Failed to get account for network "${network}" at index ${accountIndex}: ${error.message}`,
      ERROR_CODES.ACCOUNT_BALANCES
    )
  }
  
  if (typeof account[methodName] !== 'function') {
    if (options.defaultValue !== undefined) {
      logger.warn(`${methodName} not available for network: ${network}, returning default value`)
      return options.defaultValue
    }
    const availableMethods = Object.keys(account)
      .filter(key => typeof account[key] === 'function')
      .join(', ')
    throw createErrorWithCode(
      `Method "${methodName}" not found on account for network "${network}". ` +
      `Available methods: ${availableMethods}`,
      ERROR_CODES.BAD_REQUEST
    )
  }
  
  const methodArgs = Array.isArray(args) ? args : [args]
  const result = await account[methodName](...methodArgs)
  
  if (options.transformResult) {
    return options.transformResult(result)
  }
  
  return result
}

/**
 * Register all RPC handlers with the provided RPC instance
 * @param {Object} rpc - The HRPC instance
 * @param {Object} context - Context object containing state and dependencies
 * @param {Object} context.wdk - WDK instance (can be null)
 * @param {Object} context.WDK - WDK class constructor
 * @param {Object} context.walletManagers - Wallet managers map
 * @param {Array} context.requiredNetworks - Required networks array
 * @param {Object} context.wdkLoadError - WDK load error (if any)
 */
function registerRpcHandlers(rpc, context) {
  const { WDK, walletManagers, requiredNetworks, wdkLoadError } = context
  
  // Create a context object that will be passed to handlers
  // This allows handlers to read and update the wdk state
  const handlerContext = {
    get wdk() {
      return context.wdk
    },
    set wdk(value) {
      context.wdk = value
    }
  }

  /**
   * Generate entropy and encrypt seed buffer and entropy
   */
  rpc.onWorkletStart(withErrorHandling(async (init) => {
    // workletStart no longer initializes WDK - that's done via initializeWDK
    return { status: 'started' }
  }))

  /**
   * Generate entropy and encrypt seed buffer and entropy
   */
  rpc.onGenerateEntropyAndEncrypt(withErrorHandling(async (request) => {
    const { wordCount } = request
    
    // Validate request and word count
    validateRequest(request, () => validateWordCount(wordCount, 'wordCount'))
    
    // Generate entropy
    const entropy = generateEntropy(wordCount)
    
    // Generate mnemonic from entropy
    const mnemonic = entropyToMnemonic(entropy, wordlist)
    
    const seedBuffer = mnemonicToSeedSync(mnemonic)
    const entropyBuffer = Buffer.from(entropy)
    
    // Encrypt both secrets using the helper function
    const { encryptionKey, encryptedSeedBuffer, encryptedEntropyBuffer } = encryptSecrets(seedBuffer, entropyBuffer)
    
    // Zero out sensitive buffers
    memzero(entropy)
    memzero(seedBuffer)
    memzero(entropyBuffer)
    
    return {
      encryptionKey,
      encryptedSeedBuffer,
      encryptedEntropyBuffer
    }
  }))

  /**
   * Get mnemonic phrase from encrypted entropy
   */
  rpc.onGetMnemonicFromEntropy(withErrorHandling(async (request) => {
    const { encryptedEntropy, encryptionKey } = request
    
    // Validate request and inputs
    validateRequest(request, () => {
      validateBase64(encryptedEntropy, 'encryptedEntropy')
      validateBase64(encryptionKey, 'encryptionKey')
    })
    
    // Decrypt entropy
    const entropyBuffer = decrypt(encryptedEntropy, encryptionKey)
    // Create a new Uint8Array and copy bytes explicitly for @scure/bip39 compatibility
    const entropy = new Uint8Array(entropyBuffer.length)
    entropy.set(entropyBuffer)
    
    // Convert entropy to mnemonic
    const mnemonic = entropyToMnemonic(entropy, wordlist)
    
    // Zero out sensitive buffers
    memzero(entropyBuffer)
    memzero(entropy)
    
    return { mnemonic }
  }))

  /**
   * RPC handler: Convert mnemonic phrase to encrypted seed and entropy
   * 
   * Takes a BIP39 mnemonic phrase and derives both the seed (used by WDK) 
   * and entropy (original random bytes), then encrypts both for secure storage.
   * 
   * @param {Object} request - The RPC request object
   * @param {string} request.mnemonic - BIP39 mnemonic phrase (12 or 24 words)
   * @returns {Promise<Object>} Encrypted seed and entropy with encryption key
   */
  rpc.onGetSeedAndEntropyFromMnemonic(withErrorHandling(async (request) => {
    const { mnemonic } = request
    
    // Validate request and mnemonic input
    validateRequest(request, () => validateMnemonic(mnemonic, 'mnemonic'))
    
    // Derive seed from mnemonic (used by WDK for wallet operations)
    const seed = mnemonicToSeedSync(mnemonic)
    // Extract entropy from mnemonic (original random bytes used to generate mnemonic)
    const entropy = mnemonicToEntropy(mnemonic, wordlist)

    // Encrypt both secrets and return with the encryption key
    return encryptSecrets(seed, entropy)
  }))

  /**
   * Initialize WDK with either encryptionKey + encryptedSeed
   */
  rpc.onInitializeWDK(withErrorHandling(async (init) => {
    // Validate request object (validation of fields happens below)
    if (!init || typeof init !== 'object') {
      throw createErrorWithCode('Init must be an object', ERROR_CODES.BAD_REQUEST)
    }
    
    if (!WDK) {
      const errorMsg = wdkLoadError
        ? `WDK failed to load: ${wdkLoadError.message}\nStack: ${wdkLoadError.stack || 'No stack trace'}`
        : 'WDK not loaded - unknown error during initialization'
      throw createErrorWithCode(errorMsg, ERROR_CODES.WDK_MANAGER_INIT)
    }
    
    if (handlerContext.wdk) {
      logger.info('Disposing existing WDK instance...')
      handlerContext.wdk.dispose()
    }
    
    // Validate config
    let networkConfigs
    validateRequest(init, () => {
      validateNonEmptyString(init.config, 'config')
      networkConfigs = validateJSON(init.config, 'config')
      
      // Validate encrypted seed and encryption key
      if (!init.encryptionKey || !init.encryptedSeed) {
        throw createErrorWithCode('(encryptionKey + encryptedSeed) must be provided', ERROR_CODES.BAD_REQUEST)
      }
      validateBase64(init.encryptionKey, 'encryptionKey')
      validateBase64(init.encryptedSeed, 'encryptedSeed')
    }, 'Init')
    
    const missingNetworks = requiredNetworks.filter(network => !networkConfigs[network])
    
    if (missingNetworks.length > 0) {
      throw createErrorWithCode(`Missing network configurations: ${missingNetworks.join(', ')}`, ERROR_CODES.BAD_REQUEST)
    }
    
    // Initialize from encrypted seed
    logger.info('Initializing WDK with encrypted seed')
    let decryptedSeedBuffer
    try {
      decryptedSeedBuffer = decrypt(init.encryptedSeed, init.encryptionKey)
    } catch (error) {
      throw createErrorWithCode(`Failed to decrypt seed: ${error.message}`, ERROR_CODES.BAD_REQUEST)
    }
    
    handlerContext.wdk = new WDK(decryptedSeedBuffer)
    
    for (const [networkName, config] of Object.entries(networkConfigs)) {
      if (config && typeof config === 'object') {
        const walletManager = walletManagers[networkName]
        
        if (!walletManager) {
          throw createErrorWithCode(`No wallet manager found for network: ${networkName}`, ERROR_CODES.WDK_MANAGER_INIT)
        }
        
        logger.info(`Registering ${networkName} wallet`)
        handlerContext.wdk.registerWallet(networkName, walletManager, config)
      }
    }
    
    logger.info('WDK initialization complete')
    return { status: 'initialized' }
  }))

  /**
   * Generic handler for all WDK account methods
   * This single handler can call any method on any WDK account dynamically
   * No special handling - just calls the method and returns the raw result
   */
  rpc.onCallMethod(withErrorHandling(async (payload) => {
    const { methodName, network, accountIndex, args: argsJson } = payload
    
    // Validate request and required fields
    let args
    validateRequest(payload, () => {
      validateNonEmptyString(methodName, 'methodName')
      validateNonEmptyString(network, 'network')
      validateNonNegativeInteger(accountIndex, 'accountIndex')
      
      // Parse args if provided (JSON string)
      args = argsJson ? validateJSON(argsJson, 'args') : null
    }, 'Payload')
    
    // Call the method directly - no special handling
    const result = await callWdkMethod(
      handlerContext,
      methodName,
      network,
      accountIndex,
      args
    )
    
    // Return as JSON string (raw result, no transformation)
    // Use safeStringify to handle BigInt values
    return { result: safeStringify(result) }
  }))

  rpc.onDispose(withErrorHandling(() => {
    if (handlerContext.wdk) {
      handlerContext.wdk.dispose()
      handlerContext.wdk = null
    }
  }))
}

module.exports = {
  registerRpcHandlers,
  withErrorHandling,
  validateRequest,
  createErrorWithCode,
  callWdkMethod
}
