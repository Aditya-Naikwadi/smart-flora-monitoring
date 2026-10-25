/* global __dirname */
const fs = require('fs');
const path = require('path');

const filesToPatch = [
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'PushTokenManager.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'NotificationsHandlerModule.js')
];

for (const filePath of filesToPatch) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('let warningHasBeenShown = false;')) {
      content = content.replace('let warningHasBeenShown = false;', 'let warningHasBeenShown = true;');
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[Patch] Suppressed web notification warnings in: ${path.basename(filePath)}`);
    }
  }
}

// Patch ExpoTopicSubscriptionModule for Expo Go on Android
const topicSubPath = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'TopicSubscriptionModule.android.js');
const cleanStub = `const module = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};
export default module;
`;

if (fs.existsSync(topicSubPath)) {
  fs.writeFileSync(topicSubPath, cleanStub, 'utf8');
  console.log('[Patch] Made ExpoTopicSubscriptionModule safe for Expo Go');
}

const topicSubSrcPath = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'src', 'TopicSubscriptionModule.android.ts');
if (fs.existsSync(topicSubSrcPath)) {
  fs.writeFileSync(topicSubSrcPath, cleanStub, 'utf8');
}


const topicSubJsPath = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'topicSubscription.js');
if (fs.existsSync(topicSubJsPath)) {
  let content = fs.readFileSync(topicSubJsPath, 'utf8');
  if (content.includes("import TopicSubscriptionModule from './TopicSubscriptionModule';")) {
    content = content.replace(
      "import TopicSubscriptionModule from './TopicSubscriptionModule';",
      cleanStub.replace('export default module;', 'const TopicSubscriptionModule = module;')
    );
    fs.writeFileSync(topicSubJsPath, content, 'utf8');
    console.log('[Patch] Inlined TopicSubscriptionModule stub inside topicSubscription.js');
  }
}

// Remove stale map files
const mapFiles = [
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'TopicSubscriptionModule.android.js.map'),
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'topicSubscription.js.map')
];
for (const mf of mapFiles) {
  if (fs.existsSync(mf)) {
    try { fs.unlinkSync(mf); } catch { /* ignore */ }
  }
}

// Fix Windows backslash issue in Expo Router require.context

const babelRouterPlugin = path.join(__dirname, '..', 'node_modules', 'babel-preset-expo', 'build', 'plugins', 'expo-router-plugin.js');
if (fs.existsSync(babelRouterPlugin)) {
  let content = fs.readFileSync(babelRouterPlugin, 'utf8');
  if (content.includes("const appRoot = _nodepath().default.relative(_nodepath().default.dirname(currentFile), appFolder);")) {
    content = content.replace(
      "const appRoot = _nodepath().default.relative(_nodepath().default.dirname(currentFile), appFolder);",
      "const appRoot = _nodepath().default.relative(_nodepath().default.dirname(currentFile), appFolder).replace(/\\\\/g, '/');"
    );
    fs.writeFileSync(babelRouterPlugin, content, 'utf8');
    console.log('[Patch] Fixed Windows path separators in babel-preset-expo');
  }
}

const noxcturnalProcessEnv = path.join(__dirname, '..', 'node_modules', '@expo', 'metro-config', 'build', 'transform-worker', 'noxcturnal', 'plugins', 'process-env.js');
if (fs.existsSync(noxcturnalProcessEnv)) {
  let content = fs.readFileSync(noxcturnalProcessEnv, 'utf8');
  if (content.includes("routerRoot(state));")) {
    content = content.replace("routerRoot(state));", "routerRoot(state)).replace(/\\\\/g, '/');");
    fs.writeFileSync(noxcturnalProcessEnv, content, 'utf8');
  }
}

const useScreensPath = path.join(__dirname, '..', 'node_modules', 'expo-router', 'build', 'useScreens.js');

if (fs.existsSync(useScreensPath)) {
  let content = fs.readFileSync(useScreensPath, 'utf8');
  if (content.includes("function fromImport(value, { ErrorBoundary, SuspenseFallback, unstable_settings, ...component }) {")) {
    content = content.replace(
      "function fromImport(value, { ErrorBoundary, SuspenseFallback, unstable_settings, ...component }) {",
      `function fromImport(value, rawComponent) {
    if (!rawComponent) {
        console.error('[Expo Router] Route module returned undefined for: ' + (value?.contextKey || value?.route));
        return { default: _EmptyRoute.EmptyRoute };
    }
    const { ErrorBoundary, SuspenseFallback, unstable_settings, ...component } = rawComponent;`
    );
    fs.writeFileSync(useScreensPath, content, 'utf8');
    console.log('[Patch] Protected useScreens fromImport from undefined routes');
  }
}


