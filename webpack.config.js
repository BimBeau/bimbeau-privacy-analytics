const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

const cssAssetPublicPath = process.env.BBPA_ADMIN_CSS_PUBLIC_PATH || '../';
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
    admin: path.resolve(__dirname, 'src/admin/index.js'),
    'style-admin': path.resolve(__dirname, 'src/admin/style.scss'),
  },
  output: {
    ...defaultConfig.output,
    filename: '[name].js',
    path: path.resolve(__dirname, 'build'),
    publicPath: process.env.BBPA_PLUGIN_PUBLIC_PATH || '/wp-content/plugins/bimbeau-privacy-analytics/build/',
  },
};
