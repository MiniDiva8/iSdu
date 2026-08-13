import { registerHooks } from 'node:module';

const isRelativeExtensionlessImport = (specifier) =>
  /^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!isRelativeExtensionlessImport(specifier)) {
      return nextResolve(specifier, context);
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') {
        throw error;
      }

      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
