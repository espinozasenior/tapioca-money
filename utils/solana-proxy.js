
// CommonJS module that proxies all property accesses to avoid build errors.
// This allows any named import to resolve to `null` instead of crashing the build.
// e.g. import { Foo } from '@solana/web3.js' -> Foo = null

const proxy = new Proxy(
  {},
  {
    get: (target, prop) => {
      // Handle ES Module interop
      if (prop === '__esModule') return true;
      if (prop === 'default') return proxy;

      // Return null for any other property access (functions, classes, constants)
      return null;
    },
  }
);

module.exports = proxy;
