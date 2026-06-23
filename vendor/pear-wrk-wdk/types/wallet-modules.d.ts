/**
 * Wallet manager interface
 * This is a generic interface for wallet managers from different modules
 */
export interface WalletManager {
  // Wallet managers have various methods depending on the network
  // This is a placeholder for the actual wallet manager interface
  [key: string]: unknown;
}

/**
 * WDK core class interface
 */
export interface WDK {
  new (seedPhrase: string): WDKInstance;
}

/**
 * WDK instance interface
 */
export interface WDKInstance {
  /**
   * Get an account for a specific network
   * @param network - Network name (e.g., 'ethereum', 'spark')
   * @param accountIndex - Account index
   * @returns Promise resolving to the account instance
   */
  getAccount(network: string, accountIndex: number): Promise<Account>;

  /**
   * Register a wallet manager for a network
   * @param networkName - Network name
   * @param walletManager - Wallet manager instance
   * @param config - Network configuration
   */
  registerWallet(networkName: string, walletManager: WalletManager, config: unknown): void;

  /**
   * Dispose of the WDK instance
   */
  dispose(): void;
}

/**
 * Account interface
 * Accounts have various methods depending on the network type
 */
export interface Account {
  [methodName: string]: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Wallet managers map
 * Maps network names to their corresponding wallet managers
 */
export interface WalletManagers {
  [networkName: string]: WalletManager;
}

/**
 * Wallet modules export structure
 */
export interface WalletModules {
  WDK: WDK;
  walletManagers: WalletManagers;
  requiredNetworks: string[];
}
