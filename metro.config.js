const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const isExpoGoDev = process.env.EXPO_PUBLIC_EXPO_GO === '1';

const config = getDefaultConfig(__dirname);

const stubs = {
  'react-native-image-picker': path.resolve(__dirname, 'src/dev/stubs/react-native-image-picker.js'),
  '@react-native-firebase/app': path.resolve(__dirname, 'src/dev/stubs/react-native-firebase-app.js'),
  '@react-native-firebase/app-check': path.resolve(
    __dirname,
    'src/dev/stubs/react-native-firebase-app-check.js',
  ),
  '@react-native-google-signin/google-signin': path.resolve(
    __dirname,
    'src/dev/stubs/react-native-google-signin.js',
  ),
  '@re-agentation/probe': path.resolve(__dirname, 'src/dev/stubs/re-agentation-probe.js'),
  '@sentry/react-native': path.resolve(__dirname, 'src/dev/stubs/sentry-react-native.js'),
};

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isExpoGoDev && stubs[moduleName]) {
    return {
      filePath: stubs[moduleName],
      type: 'sourceFile',
    };
  }

  if (moduleName === 'react-native-image-picker') {
    return {
      filePath: stubs['react-native-image-picker'],
      type: 'sourceFile',
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

const configWithNativeWind = withNativeWind(config, { input: './global.css' });

if (process.env.NODE_ENV !== 'production' && !isExpoGoDev) {
  const { withReagentation } = require('@re-agentation/metro');
  module.exports = withReagentation(configWithNativeWind);
} else {
  module.exports = configWithNativeWind;
}
