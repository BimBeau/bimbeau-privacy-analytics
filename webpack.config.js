const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

const cssAssetPublicPath = process.env.BBPA_ADMIN_CSS_PUBLIC_PATH || '../';
const adminSourceRoot = process.env.BBPA_ADMIN_SOURCE_ROOT
  ? path.resolve(process.env.BBPA_ADMIN_SOURCE_ROOT)
  : path.resolve(__dirname, 'src/admin');
const packageTarget = process.env.BBPA_PACKAGE_TARGET || 'free';
const isFreePackageBuild = packageTarget === 'free';
const adminEntryPoint = isFreePackageBuild ? 'index.free.js' : 'index.premium.js';
const premiumReportExportActionPath = path.resolve(
  adminSourceRoot,
  'premium/components/ReportExportAction'
);
const sharedReportExportActionPath = path.resolve(
  adminSourceRoot,
  'components/ReportExportAction'
);
const premiumTopPagesPanelPath = path.resolve(
  adminSourceRoot,
  'premium/panels/TopPagesPanel'
);
const sharedTopPagesPanelPath = path.resolve(
  adminSourceRoot,
  'panels/TopPagesPanel'
);
const premiumGeolocationPanelPath = path.resolve(
  adminSourceRoot,
  'premium/panels/GeolocationPanel'
);
const sharedGeolocationPanelPath = path.resolve(
  adminSourceRoot,
  'panels/GeolocationPanel'
);
const premiumAdminUrlsPath = path.resolve(
  adminSourceRoot,
  'premium/lib/adminUrls'
);
const sharedAdminUrlsPath = path.resolve(adminSourceRoot, 'lib/adminUrls');
const freeOverviewPanelStubPath = path.resolve(
  adminSourceRoot,
  'free-stubs/OverviewPanel.js'
);
const freeAdminAppPath = path.resolve(adminSourceRoot, 'free-stubs/AdminApp.js');
const freeSettingsPanelStubPath = path.resolve(adminSourceRoot, 'free-stubs/SettingsPanel.js');
const freePanelRegistryPath = path.resolve(adminSourceRoot, 'free-stubs/registry.js');
const proOnlyAdminAliases = isFreePackageBuild
  ? {
      [path.resolve(adminSourceRoot, 'panels/OverviewPanel')]: freeOverviewPanelStubPath,
      [path.resolve(adminSourceRoot, 'panels/OverviewPanel.js')]: freeOverviewPanelStubPath,
      [path.resolve(adminSourceRoot, 'AdminApp')]: freeAdminAppPath,
      [path.resolve(adminSourceRoot, 'AdminApp.js')]: freeAdminAppPath,
      [path.resolve(adminSourceRoot, 'panels/SettingsPanel')]: freeSettingsPanelStubPath,
      [path.resolve(adminSourceRoot, 'panels/SettingsPanel.js')]: freeSettingsPanelStubPath,
      [path.resolve(adminSourceRoot, 'panels/registry')]: freePanelRegistryPath,
      [path.resolve(adminSourceRoot, 'panels/registry.js')]: freePanelRegistryPath,
    }
  : {
      [sharedReportExportActionPath]: premiumReportExportActionPath,
      [`${sharedReportExportActionPath}/index.js`]: `${premiumReportExportActionPath}/index.js`,
      [sharedTopPagesPanelPath]: premiumTopPagesPanelPath,
      [`${sharedTopPagesPanelPath}.js`]: `${premiumTopPagesPanelPath}.js`,
      [sharedGeolocationPanelPath]: premiumGeolocationPanelPath,
      [`${sharedGeolocationPanelPath}.js`]: `${premiumGeolocationPanelPath}.js`,
      [sharedAdminUrlsPath]: premiumAdminUrlsPath,
      [`${sharedAdminUrlsPath}.js`]: `${premiumAdminUrlsPath}.js`,
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
      ...proOnlyAdminAliases,
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
    admin: path.resolve(adminSourceRoot, adminEntryPoint),
    'style-admin': path.resolve(adminSourceRoot, isFreePackageBuild ? 'style.free.scss' : 'style.scss'),
  },
  output: {
    ...defaultConfig.output,
    filename: '[name].js',
    path: path.resolve(__dirname, 'build'),
    publicPath: process.env.BBPA_PLUGIN_PUBLIC_PATH || '/wp-content/plugins/bimbeau-privacy-analytics/build/',
  },
};
