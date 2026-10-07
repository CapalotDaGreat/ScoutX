// Lets unit tests load app modules that use extensionless relative imports between .ts files
// and the `@/` alias for `src/`.
const srcRoot = new URL('../../../src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = new URL(specifier.slice(2), srcRoot).href;
    for (const candidate of [target, `${target}.ts`, `${target}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch (error) {
        if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'ERR_UNSUPPORTED_DIR_IMPORT') {
          throw error;
        }
      }
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && relative && !/\.[cm]?[jt]s$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
