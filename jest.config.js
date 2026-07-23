const wordpressConfig = require("@wordpress/scripts/config/jest-unit.config");

module.exports = {
  ...wordpressConfig,
  transformIgnorePatterns: [
    "/node_modules/(?!(@nivo|d3-[^/]+|internmap|use-sync-external-store)/)",
  ],
};
