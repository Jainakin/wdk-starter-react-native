const fs = require('fs');
const path = require('path');

const configPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-bare-kit',
  'react-native.config.js'
);
const bareFetchResponseStreamPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'bare-fetch',
  'lib',
  'response-stream.js'
);

const patchFile = (filePath, patchName, patcher) => {
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-bare-kit-config] ${patchName} target is not installed yet`);
    return;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const patched = patcher(source);

  if (patched === source) {
    console.log(`[patch-bare-kit-config] ${patchName} already present`);
    return;
  }

  fs.writeFileSync(filePath, patched);
  console.log(`[patch-bare-kit-config] Applied ${patchName}`);
};

patchFile(configPath, 'BareKit iOS modulesProvider', (source) => {
  if (source.includes("BareKit: 'BareKitModuleProvider'")) {
    return source;
  }

  const patched = source.replace(
    'ios: {},',
    `ios: {
        modulesProvider: {
          BareKit: 'BareKitModuleProvider'
        }
      },`
  );

  if (patched === source) {
    throw new Error('[patch-bare-kit-config] Could not find ios config block to patch');
  }

  return patched;
});

patchFile(bareFetchResponseStreamPath, 'bare-fetch nullable socket guard', (source) => {
  if (source.includes("typeof this._response.socket.ref === 'function'")) {
    return source;
  }

  let patched = source.replace(
    '    this._response.socket.unref()\n',
    `    if (this._response.socket && typeof this._response.socket.unref === 'function') {
      this._response.socket.unref()
    }
`
  );

  patched = patched.replace(
    '    this._response.socket.ref()\n',
    `    if (this._response.socket && typeof this._response.socket.ref === 'function') {
      this._response.socket.ref()
    }
`
  );

  if (patched === source) {
    throw new Error('[patch-bare-kit-config] Could not patch bare-fetch response stream');
  }

  return patched;
});
