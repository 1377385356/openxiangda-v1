import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'tsup';

const sdkRoot = 'packages/sdk';
const require = createRequire(import.meta.url);
const stagedComponentsShimPath = join(
  process.cwd(),
  sdkRoot,
  'src',
  'shims',
  'staged-components.tsx',
);
const useSyncExternalStoreShimPath = join(
  process.cwd(),
  sdkRoot,
  'src',
  'shims',
  'use-sync-external-store-shim.ts',
);

const dependencyEsmAliasPlugin = {
  name: 'dependency-esm-alias',
  setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string }) => void }) {
    build.onResolve({ filter: /^staged-components$/ }, () => ({
      path: stagedComponentsShimPath,
    }));
    build.onResolve({ filter: /^use-sync-external-store\/shim(?:\/index\.js)?$/ }, () => ({
      path: useSyncExternalStoreShimPath,
    }));
    build.onResolve({ filter: /^dayjs\/locale\/[^/]+(?:\.js)?$/ }, (args) => {
      const localeName = args.path
        .replace('dayjs/locale/', '')
        .replace(/\.js$/, '');
      return { path: require.resolve(`dayjs/esm/locale/${localeName}.js`) };
    });
    build.onResolve({ filter: /^dayjs\/plugin\/[^/]+(?:\.js)?$/ }, (args) => {
      const pluginName = args.path
        .replace('dayjs/plugin/', '')
        .replace(/\.js$/, '');
      return { path: require.resolve(`dayjs/esm/plugin/${pluginName}/index.js`) };
    });
    build.onResolve({ filter: /^rc-util\/lib\// }, (args) => ({
      path: require.resolve(args.path.replace('rc-util/lib/', 'rc-util/es/')),
    }));
    build.onResolve({ filter: /^rc-field-form\/lib\// }, (args) => ({
      path: require.resolve(args.path.replace('rc-field-form/lib/', 'rc-field-form/es/')),
    }));
  },
};

const copyTokens = () => {
  const target = join(sdkRoot, 'dist', 'styles', 'tokens.css');
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(sdkRoot, 'src', 'styles', 'tokens.css'), target);
};

export default defineConfig({
  entry: {
    'components/index': `${sdkRoot}/src/components/index.ts`,
    'runtime/index': `${sdkRoot}/src/runtime/index.ts`,
    'runtime/react': `${sdkRoot}/src/runtime/react/index.ts`,
    'build/index': `${sdkRoot}/src/build/index.ts`,
    'workflow/index': `${sdkRoot}/src/workflow/index.ts`,
    'styles/tailwind-preset': `${sdkRoot}/src/styles/tailwind-preset.ts`,
    'styles/antd-theme': `${sdkRoot}/src/styles/antd-theme.ts`,
  },
  outDir: `${sdkRoot}/dist`,
  tsconfig: `${sdkRoot}/tsconfig.json`,
  format: ['esm', 'cjs'],
  platform: 'browser',
  dts: true,
  // The published SDK is a production artifact. Minification plus omitting
  // multi-megabyte source maps keeps every global CLI update small; authored
  // TypeScript sources remain available in the repository for diagnostics.
  sourcemap: false,
  clean: true,
  splitting: false,
  minify: true,
  external: [
    'react',
    'react-dom',
    'react-dom/client',
    'antd',
    /^antd\//,
    '@ant-design/cssinjs',
    '@ant-design/icons',
    'antd-mobile',
    /^antd-mobile\//,
    'antd-mobile-icons',
    /^antd-mobile-icons\//,
    'dayjs',
    /^dayjs\//,
    /^@tiptap\//,
    /^@tiptap\/pm\//,
    'docx-preview',
    'heic2any',
  ],
  esbuildPlugins: [dependencyEsmAliasPlugin],
  esbuildOptions(options) {
    options.mainFields = ['module', 'browser', 'main'];
  },
  shims: true,
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' };
  },
  async onSuccess() {
    copyTokens();
  },
});
