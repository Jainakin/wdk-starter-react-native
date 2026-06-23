# @wdk/bare

A secure wallet development kit worklet for handling cryptographic operations including seed phrase generation, encryption, and wallet initialization. This module provides a worklet environment for wallet operations using the WDK (Wallet Development Kit) framework.

## Overview

This module provides a secure worklet implementation that handles:

- **Seed Phrase Generation**: Generate BIP39-compliant mnemonic phrases (12 or 24 words)
- **Encryption**: AES-256-GCM encryption for sensitive data (seeds, entropy)
- **Wallet Initialization**: Initialize and manage multiple wallet networks
- **RPC Communication**: HRPC-based communication interface for wallet operations

## Installation

```bash
npm install @wdk/bare
```

## Architecture

The module runs as a worklet in a Bare runtime environment, providing isolation for sensitive cryptographic operations. It uses:

- **HRPC**: For RPC communication between the worklet and host
- **Bare IPC**: For inter-process communication
- **@scure/bip39**: For BIP39 mnemonic phrase operations
- **bare-crypto**: For cryptographic operations (AES-256-GCM)

## Setup

### Prerequisites

- Node.js (with Bare runtime support)
- Network configurations for required networks (see Configuration)

### Initial Setup

1. Install dependencies:
```bash
npm install
```

2. Generate required files:
```bash
npm run gen:wallet-modules
npm run gen:hrpc
```

3. Build bundles (optional):
```bash
npm run gen:macos-bundle    # For macOS
npm run gen:mobile-bundle   # For mobile platforms
```

## Configuration

The module requires network configurations for all required networks. Configure networks in the `schema.json` file:

```json
{
  "config": {
    "walletModules": {
      "evmErc4337": {
        "modulePath": "@tetherto/wdk-wallet-evm-erc-4337",
        "networks": ["ethereum", "polygon", "arbitrum", "plasma", "sepolia"]
      },
      "spark": {
        "modulePath": "@tetherto/wdk-wallet-spark",
        "networks": ["spark"]
      }
    },
    "requiredNetworks": ["ethereum", "polygon", "arbitrum", "plasma", "sepolia", "spark"]
  }
}
```

## API Documentation

### RPC Methods

#### `workletStart`

Initialize the worklet (no longer initializes WDK - use `initializeWDK` instead).

**Request:**
```typescript
{
  enableDebugLogs?: number;
  seedPhrase?: string;
  seedBuffer?: string;
  config: string; // JSON string of network configurations
}
```

**Response:**
```typescript
{
  status: string;
}
```

#### `initializeWDK`

Initialize the WDK with encrypted seed and network configurations.

**Request:**
```typescript
{
  encryptionKey: string;      // Base64-encoded encryption key
  encryptedSeed: string;     // Base64-encoded encrypted seed
  config: string;             // JSON string of network configurations
}
```

**Response:**
```typescript
{
  status: string;
}
```

#### `generateEntropyAndEncrypt`

Generate entropy and create encrypted seed and entropy buffers.

**Request:**
```typescript
{
  wordCount: number; // 12 or 24
}
```

**Response:**
```typescript
{
  encryptionKey: string;           // Base64-encoded encryption key
  encryptedSeedBuffer: string;      // Base64-encoded encrypted seed
  encryptedEntropyBuffer: string;   // Base64-encoded encrypted entropy
}
```

#### `getMnemonicFromEntropy`

Retrieve mnemonic phrase from encrypted entropy.

**Request:**
```typescript
{
  encryptedEntropy: string;  // Base64-encoded encrypted entropy
  encryptionKey: string;     // Base64-encoded encryption key
}
```

**Response:**
```typescript
{
  mnemonic: string; // BIP39 mnemonic phrase
}
```

#### `getSeedAndEntropyFromMnemonic`

Convert mnemonic phrase to encrypted seed and entropy.

**Request:**
```typescript
{
  mnemonic: string; // BIP39 mnemonic phrase (12 or 24 words)
}
```

**Response:**
```typescript
{
  encryptionKey: string;           // Base64-encoded encryption key
  encryptedSeedBuffer: string;    // Base64-encoded encrypted seed
  encryptedEntropyBuffer: string; // Base64-encoded encrypted entropy
}
```

#### `callMethod`

Call any method on a WDK account.

**Request:**
```typescript
{
  methodName: string;    // Method name to call
  network: string;       // Network name (e.g., 'ethereum', 'spark')
  accountIndex: number;   // Account index
  args?: string;         // Optional JSON string of arguments
}
```

**Response:**
```typescript
{
  result: string; // JSON string of result
}
```

#### `dispose`

Dispose of the WDK instance and clean up resources.

**Request:** (empty)

**Response:** (none)

## Usage Example

```javascript
const { bundle, HRPC } = require('@wdk/bare')
const IPC = require('bare-ipc')

// Create IPC connection
const [workletPort, clientPort] = IPC.open()
const workletIPC = workletPort.connect()
const clientIPC = clientPort.connect()

// Provide BareKit global
global.BareKit = { IPC: workletIPC }

// Load the worklet bundle
require(bundle)

// Create HRPC client
const hrpc = new HRPC(clientIPC)

// Initialize worklet
await hrpc.workletStart({
  config: JSON.stringify(networkConfigs)
})

// Generate entropy and encrypt
const { encryptionKey, encryptedSeedBuffer, encryptedEntropyBuffer } = 
  await hrpc.generateEntropyAndEncrypt({ wordCount: 12 })

// Initialize WDK
await hrpc.initializeWDK({
  encryptionKey,
  encryptedSeed: encryptedSeedBuffer,
  config: JSON.stringify(networkConfigs)
})

// Call a method
const result = await hrpc.callMethod({
  methodName: 'getAddress',
  network: 'ethereum',
  accountIndex: 0
})

// Cleanup
await hrpc.dispose({})
```

## Security Considerations

### Memory Security

- **Sensitive Data Zeroing**: All sensitive buffers (seeds, entropy, keys) are zeroed after use using `memzero()` function
- **Encryption**: All sensitive data is encrypted using AES-256-GCM before storage or transmission
- **Isolation**: The worklet runs in an isolated environment, providing additional security

### Error Handling

- **Error Sanitization**: Error messages are sanitized in production mode to prevent information leakage
- **Structured Errors**: Errors include error codes for proper categorization
- **Development Mode**: Stack traces are only included in development mode

### Input Validation

- All RPC handlers include comprehensive input validation
- Base64 strings are validated before decryption
- JSON strings are validated before parsing
- Network names, method names, and account indices are validated

### Best Practices

1. **Never log sensitive data**: The logger automatically filters sensitive information
2. **Use encrypted storage**: Always store seeds and entropy in encrypted form
3. **Zero memory after use**: The module automatically zeros sensitive buffers, but be aware of copies
4. **Validate all inputs**: Input validation is built-in, but validate on the client side too
5. **Handle errors properly**: Use error codes to handle different error types appropriately

## Error Codes

The module uses the following error codes:

- `UNKNOWN`: Unknown or unclassified error
- `BAD_REQUEST`: Invalid input or request format
- `WDK_MANAGER_INIT`: Error during WDK initialization
- `ACCOUNT_BALANCES`: Error related to account operations

## Logging

The module uses a logging utility with log levels:

- `DEBUG`: Detailed debugging information
- `INFO`: General informational messages
- `WARN`: Warning messages
- `ERROR`: Error messages

Set log level via environment variable:
```bash
LOG_LEVEL=DEBUG node your-script.js
```

## Development

### Scripts

- `npm run build:types` - Build TypeScript type definitions
- `npm run lint` - Run linter
- `npm run lint:fix` - Fix linting issues
- `npm run gen:wallet-modules` - Generate wallet modules file
- `npm run gen:hrpc` - Generate HRPC files
- `npm run gen:macos-bundle` - Generate macOS bundle
- `npm run gen:mobile-bundle` - Generate mobile bundle

### Testing

See `test/test-lightning.js` for an example test implementation.

## Dependencies

### Core Dependencies

- `@scure/bip39`: BIP39 mnemonic phrase operations
- `@tetherto/wdk`: Wallet Development Kit core
- `hrpc`: RPC communication protocol
- `hyperschema`: Schema definition and validation
- `bare-crypto`: Cryptographic operations

### Wallet Modules

- `@tetherto/wdk-wallet-evm-erc-4337`: EVM ERC-4337 wallet support
- `@tetherto/wdk-wallet-spark`: Spark network wallet support

## License

Apache-2.0

## Author

Tether

## Contributing

When contributing to this module:

1. Follow the existing code style (Standard JS)
2. Add input validation for all new RPC handlers
3. Use the logging utility instead of console.log
4. Zero out sensitive memory after use
5. Add appropriate error codes for new error types
6. Update this README for any API changes

