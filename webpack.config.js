const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

const cssAssetPublicPath = process.env.BBPA_ADMIN_CSS_PUBLIC_PATH || '../';
const adminSourceRoot = process.env.BBPA_ADMIN_SOURCE_ROOT
  ? path.resolve(process.env.BBPA_ADMIN_SOURCE_ROOT)
  : path.resolve(__dirname, 'src/admin');
const freeAdminAppStubPath = path.resolve(adminSourceRoot, 'free-stubs/AdminApp.js');
const freeOverviewPanelStubPath = path.resolve(adminSourceRoot, 'free-stubs/OverviewPanel.js');
const freeAdminUrlsStubPath = path.resolve(adminSourceRoot, 'free-stubs/adminUrls.js');
const freeAdminAliases = {
  [path.resolve(adminSourceRoot, 'AdminApp')]: freeAdminAppStubPath,
  [path.resolve(adminSourceRoot, 'AdminApp.js')]: freeAdminAppStubPath,
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

module.exports = {
  ...defaultConfig,
  resolve: {
    ...(defaultConfig.resolve || {}),
    alias: {
      ...((defaultConfig.resolve || {}).alias || {}),
      ...freeAdminAliases,
    },
    modules: [path.resolve(__dirname, 'node_modules'), 'node_modules'],
  },
  plugins: [
    ...(defaultConfig.plugins || []),
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
