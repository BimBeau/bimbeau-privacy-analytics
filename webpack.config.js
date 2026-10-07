const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const DependencyExtractionWebpackPlugin = require('@wordpress/dependency-extraction-webpack-plugin');

const cssAssetPublicPath = process.env.BBPA_ADMIN_CSS_PUBLIC_PATH || '../';
const adminSourceRoot = process.env.BBPA_ADMIN_SOURCE_ROOT
  ? path.resolve(process.env.BBPA_ADMIN_SOURCE_ROOT)
  : path.resolve(__dirname, 'src/admin');
const freeOverviewPanelStubPath = path.resolve(adminSourceRoot, 'free-stubs/OverviewPanel.js');
const freeEditionAdminRuntimePath = path.resolve(adminSourceRoot, 'free-stubs/edition-admin-runtime.js');
const freeAdminUrlsStubPath = path.resolve(adminSourceRoot, 'free-stubs/adminUrls.js');
const freeAdminAliases = {
  [path.resolve(adminSourceRoot, 'edition-admin-runtime')]: freeEditionAdminRuntimePath,
  [path.resolve(adminSourceRoot, 'edition-admin-runtime.js')]: freeEditionAdminRuntimePath,
  [path.resolve(adminSourceRoot, 'lib/adminUrls')]: freeAdminUrlsStubPath,
  [path.resolve(adminSourceRoot, 'lib/adminUrls.js')]: freeAdminUrlsStubPath,
  [path.resolve(adminSourceRoot, 'panels/OverviewPanel')]: freeOverviewPanelStubPath,
  [path.resolve(adminSourceRoot, 'panels/OverviewPanel.js')]: freeOverviewPanelStubPath,
};
const flagIconsFlagsPath = `${path.sep}node_modules${path.sep}flag-icons${path.sep}flags${path.sep}`;

const getSvgAssetFilename = ({ filename = '' } = {}) => {
  const normalizedFilename = filename.split(path.sep).join('/');
  const normalizedFlagPath = flagIconsFlagsPath.split(path.sep).join('/');
  const flagPathMarker = normalizedFlagPath.replace(/^\/+/, '');
  const flagPathIndex = normalizedFilename.indexOf(flagPathMarker);

  if (flagPathIndex !== -1) {
    const relativeFlagPath = normalizedFilename.slice(
      flagPathIndex + flagPathMarker.length
    );

    return `images/flags/${relativeFlagPath}`;
  }

  return `images/${path.basename(filename)}`;
};

const svgCssRule = {
  test: /\.svg$/i,
  issuer: /\.(pc|sc|sa|c)ss$/,
  type: 'asset/resource',
  generator: {
    filename: getSvgAssetFilename,
    publicPath: cssAssetPublicPath,
  },
};

const defaultRules = defaultConfig.module.rules.filter((rule) => {
  if (!rule.test || !rule.issuer) {
    return true;
  }

  return !(
    rule.test.toString() === '/\\.svg$/' &&
    rule.issuer.toString() === '/\\.(pc|sc|sa|c)ss$/'
  );
});

/*
 * @wordpress/dataviews follows the latest WordPress packages (components, private APIs, theme) that older WordPress
 * versions do not provide. The packages it imports from node_modules are bundled with it, so the lists work on every
 * supported WordPress version; the plugin's own code keeps the WordPress scripts. Only the packages whose public API
 * is stable since WordPress 6.4 stay shared: i18n (one translation registry), hooks and date.
 */
const SHARED_WORDPRESS_PACKAGES = new Set(['@wordpress/i18n', '@wordpress/hooks', '@wordpress/date']);
const nodeModulesSegment = `${path.sep}node_modules${path.sep}`;

class BundledDependenciesExtractionPlugin extends DependencyExtractionWebpackPlugin {
  externalizeWpDeps(data, callback) {
    const request = data?.request || '';
    const context = data?.context || '';

    if (
      request.startsWith('@wordpress/') &&
      context.includes(nodeModulesSegment) &&
      !SHARED_WORDPRESS_PACKAGES.has(request)
    ) {
      return callback();
    }

    return super.externalizeWpDeps(data, callback);
  }
}

const defaultPlugins = (defaultConfig.plugins || []).map((plugin) =>
  plugin instanceof DependencyExtractionWebpackPlugin
    ? new BundledDependenciesExtractionPlugin(plugin.options)
    : plugin
);

module.exports = {
  ...defaultConfig,
  resolve: {
    ...(defaultConfig.resolve || {}),
    alias: {
      ...((defaultConfig.resolve || {}).alias || {}),
      ...freeAdminAliases,
    },
    // Nearest node_modules first, so a package resolves its own nested dependency versions
    // (@wordpress/dataviews needs @wordpress/ui's @daypicker/react); the repository root stays the fallback
    // for admin sources built from outside the repository (BBPA_ADMIN_SOURCE_ROOT).
    modules: ['node_modules', path.resolve(__dirname, 'node_modules')],
  },
  plugins: [
    ...defaultPlugins,
  ],
  module: {
    ...defaultConfig.module,
    rules: [
      svgCssRule,
      ...defaultRules,
      {
        test: /\.geojson$/i,
        type: 'json',
      },
    ],
  },
  entry: {
    admin: path.resolve(adminSourceRoot, 'index.free.js'),
    'style-admin': path.resolve(adminSourceRoot, 'style.free.scss'),
  },
  output: {
    ...defaultConfig.output,
    filename: '[name].js',
    path: path.resolve(__dirname, 'build'),
    publicPath: process.env.BBPA_PLUGIN_PUBLIC_PATH || '/wp-content/plugins/bimbeau-privacy-analytics/build/',
  },
};
