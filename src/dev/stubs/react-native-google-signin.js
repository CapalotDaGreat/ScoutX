/** Expo Go stub — Google Sign-In requires a development or EAS build. */
const unavailable = async () => {
  throw new Error('Google Sign-In is not available in Expo Go.');
};

module.exports = {
  GoogleSignin: {
    configure: () => undefined,
    hasPlayServices: unavailable,
    signIn: unavailable,
    signOut: async () => undefined,
  },
  isCancelledResponse: () => false,
  isSuccessResponse: () => false,
};
