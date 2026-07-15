/** Expo Go stub — native App Check is only available in dev/EAS builds. */
class ReactNativeFirebaseAppCheckProvider {
  configure() {}
}

module.exports = {
  default: () => ({
    initializeAppCheck: async () => undefined,
    getToken: async () => ({ token: '' }),
  }),
  ReactNativeFirebaseAppCheckProvider,
};
