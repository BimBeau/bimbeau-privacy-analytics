const path = require('path');
const webpack = require('webpack');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

const cssAssetPublicPath = process.env.BBPA_ADMIN_CSS_PUBLIC_PATH || '../';
const adminSourceRoot = process.env.BBPA_ADMIN_SOURCE_ROOT
  ? path.resolve(process.env.BBPA_ADMIN_SOURCE_ROOT)
  : path.resolve(__dirname, 'src/admin');
const packageTarget = process.env.BBPA_PACKAGE_TARGET || 'premium';
const isFreePackageBuild = packageTarget === 'free';
const adminEntryPoint = isFreePackageBuild ? 'index.free.js' : 'index.premium.js';
const freeAdminStubRoot = path.resolve(adminSourceRoot, 'free-stubs');
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
const proOnlyAdminStubModules = new Map(
  [
    ['GeoCitiesPanel', 'GeoCitiesPanel.js'],
    ['PageDetailsGeoCitiesCard', 'PageDetailsGeoCitiesCard.js'],
    ['OverviewPanel', 'OverviewPanel.js'],
  ].map(([moduleName, stubFilename]) => [
    moduleName,
    path.resolve(freeAdminStubRoot, stubFilename),
  ])
);
const proOnlyAdminAliases = isFreePackageBuild
  ? Object.fromEntries(
      [...proOnlyAdminStubModules].flatMap(([moduleName, stubPath]) => [
        [path.resolve(adminSourceRoot, `panels/${moduleName}`), stubPath],
        [path.resolve(adminSourceRoot, `panels/${moduleName}.js`), stubPath],
      ])
    )
  : {
      [sharedReportExportActionPath]: premiumReportExportActionPath,
      [`${sharedReportExportActionPath}/index.js`]: `${premiumReportExportActionPath}/index.js`,
      [sharedTopPagesPanelPath]: premiumTopPagesPanelPath,
      [`${sharedTopPagesPanelPath}.js`]: `${premiumTopPagesPanelPath}.js`,
    };
const freePackageProOnlyModuleReplacements = isFreePackageBuild
  ? [
      new webpack.NormalModuleReplacementPlugin(
        /^\.\/(?:GeoCitiesPanel|PageDetailsGeoCitiesCard)(?:\.js)?$/,
        (resource) => {
          const context = path.resolve(resource.context || '');
          if (context !== path.resolve(adminSourceRoot, 'panels')) {
            return;
          }

          const moduleName = resource.request
            .replace(/^\.\//, '')
            .replace(/\.js$/, '');
          const stubPath = proOnlyAdminStubModules.get(moduleName);

          if (stubPath) {
            resource.request = stubPath;
          }
        }
      ),
    ]
  : [];
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
    ...freePackageProOnlyModuleReplacements,
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
    'style-admin': path.resolve(adminSourceRoot, 'style.scss'),
  },
  output: {
    ...defaultConfig.output,
    filename: '[name].js',
    path: path.resolve(__dirname, 'build'),
    publicPath: process.env.BBPA_PLUGIN_PUBLIC_PATH || '/wp-content/plugins/bimbeau-privacy-analytics/build/',
  },
};
