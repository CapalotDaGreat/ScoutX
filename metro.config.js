const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

const imagePickerStub = path.resolve(__dirname, 'src/dev/stubs/react-native-image-picker.js');
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-image-picker') {
    return {
      filePath: imagePickerStub,
      type: 'sourceFile',
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

const configWithNativeWind = withNativeWind(config, { input: './global.css' });

if (process.env.NODE_ENV !== 'production') {
  const { withReagentation } = require('@re-agentation/metro');
  module.exports = withReagentation(configWithNativeWind);
} else {
  module.exports = configWithNativeWind;
}
