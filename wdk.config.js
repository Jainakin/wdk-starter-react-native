module.exports = {
  networks: {
    ethereum: {
      package: '@tetherto/wdk-wallet-evm-erc-4337',
    },
    polygon: {
      package: '@tetherto/wdk-wallet-evm-erc-4337',
    },
    arbitrum: {
      package: '@tetherto/wdk-wallet-evm-erc-4337',
    },
    plasma: {
      package: '@tetherto/wdk-wallet-evm-erc-4337',
    },
    sepolia: {
      package: '@tetherto/wdk-wallet-evm-erc-4337',
    },
    spark: {
      package: '@tetherto/wdk-wallet-spark',
    },
    'rgb-lightning': {
      package: '@utexo/wdk-rgb-lightning',
    },
  },
  preloadModules: ['@buildonspark/spark-frost-bare-addon'],
  output: {
    bundle: './.wdk-bundle/wdk-worklet.bundle.js',
    types: './.wdk/index.d.ts',
  },
  options: {
    targets: [
      'ios-arm64',
      'ios-arm64-simulator',
      'ios-x64-simulator',
      'android-arm',
      'android-arm64',
      'android-ia32',
      'android-x64',
    ],
  },
};
