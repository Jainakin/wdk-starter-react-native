const base = require('@tetherto/pear-wrk-wdk-base/worklet');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNetworkConfigMap(configs) {
  if (!isObject(configs)) {
    return configs;
  }

  return Object.fromEntries(
    Object.entries(configs).map(([key, value]) => {
      if (!isObject(value)) {
        return [key, value];
      }

      if ('blockchain' in value && 'config' in value) {
        return [key, value];
      }

      return [
        key,
        {
          blockchain: value.blockchain || key,
          config: value,
        },
      ];
    }),
  );
}

function normalizeWorkletConfig(config) {
  if (!isObject(config)) {
    return config;
  }

  if (isObject(config.networks)) {
    return {
      ...config,
      networks: normalizeNetworkConfigMap(config.networks),
    };
  }

  return {
    networks: normalizeNetworkConfigMap(config),
  };
}

function normalizeJsonRequest(request, normalizeConfig) {
  if (!isObject(request) || typeof request.config !== 'string') {
    return request;
  }

  try {
    const parsed = JSON.parse(request.config);
    return {
      ...request,
      config: JSON.stringify(normalizeConfig(parsed)),
    };
  } catch {
    return request;
  }
}

function withConfigNormalizer(registerHandler, normalizeConfig) {
  return (handler) => {
    registerHandler((request) => handler(normalizeJsonRequest(request, normalizeConfig)));
  };
}

function registerRpcHandlers(rpc, context) {
  const originalOnInitializeWDK = rpc.onInitializeWDK?.bind(rpc);
  const originalOnResetWdkWallets = rpc.onResetWdkWallets?.bind(rpc);
  const originalOnRegisterWallet = rpc.onRegisterWallet?.bind(rpc);

  if (originalOnInitializeWDK) {
    rpc.onInitializeWDK = withConfigNormalizer(originalOnInitializeWDK, normalizeWorkletConfig);
  }

  if (originalOnResetWdkWallets) {
    rpc.onResetWdkWallets = withConfigNormalizer(originalOnResetWdkWallets, normalizeWorkletConfig);
  }

  if (originalOnRegisterWallet) {
    rpc.onRegisterWallet = withConfigNormalizer(originalOnRegisterWallet, (config) => {
      if (isObject(config) && isObject(config.networks)) {
        return normalizeNetworkConfigMap(config.networks);
      }
      return normalizeNetworkConfigMap(config);
    });
  }

  return base.registerRpcHandlers(rpc, context);
}

module.exports = {
  ...base,
  registerRpcHandlers,
};
