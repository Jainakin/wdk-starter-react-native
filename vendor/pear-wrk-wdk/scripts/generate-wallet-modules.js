#!/usr/bin/env node

/**
 * Generates a static wallet-modules.js file with all requires
 * This ensures the bundler can see all dependencies at build time
 */

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../schema.json');
const outputPath = path.join(__dirname, '../generated/wallet-modules.js');
const outputDir = path.dirname(outputPath);

// Ensure the generated directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read schema config
const schemaConfig = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const walletModulesConfig = schemaConfig.config?.walletModules || {};
const requiredNetworks = schemaConfig.config?.requiredNetworks || [];
const preloadModules = schemaConfig.config?.preloadModules || [];

// Generate the file content
let content = `/**
 * Auto-generated file - DO NOT EDIT MANUALLY
 * Generated from schema.json by scripts/generate-wallet-modules.js
 * 
 * This file contains all static require() statements for wallet modules
 * to ensure proper bundling.
 */

// Preload modules
`;

// Add preload modules
for (const modulePath of preloadModules) {
  content += `require('${modulePath}');\n`;
}

content += `
// Load WDK core
const wdkModule = require('@tetherto/wdk');
const WDK = wdkModule.default || wdkModule.WDK || wdkModule;

// Load wallet modules
`;

// Generate requires for each wallet module
const walletManagerVars = [];
for (const [moduleName, moduleConfig] of Object.entries(walletModulesConfig)) {
  const modulePath = moduleConfig.modulePath;
  const networks = moduleConfig.networks || [];
  const varName = `WalletManager${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`;
  walletManagerVars.push({ varName, networks });
  
  content += `const ${moduleName}Module = require('${modulePath}');\n`;
  content += `const ${varName} = ${moduleName}Module.default || ${moduleName}Module;\n`;
}

content += `
// Map networks to wallet managers
const walletManagers = {};
`;

// Generate network mappings
for (const { varName, networks } of walletManagerVars) {
  for (const network of networks) {
    content += `walletManagers['${network}'] = ${varName};\n`;
  }
}

content += `
// Export everything
module.exports = {
  WDK,
  walletManagers,
  requiredNetworks: ${JSON.stringify(requiredNetworks)}
};
`;

// Write the file
fs.writeFileSync(outputPath, content, 'utf8');
console.log(`✓ Generated ${outputPath}`);
console.log(`  - Preload modules: ${preloadModules.length}`);
console.log(`  - Wallet modules: ${Object.keys(walletModulesConfig).length}`);
console.log(`  - Networks: ${requiredNetworks.length}`);

