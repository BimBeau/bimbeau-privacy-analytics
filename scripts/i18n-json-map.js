#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const defaultLanguagesDir = path.join(repoRoot, 'languages');
const adminBundlePath = 'assets/js/admin.js';

const poReferencePattern = /^#:\s+(.*)$/;
const javascriptReferencePattern = /\.(?:m?js|jsx|ts|tsx)(?::\d+)?$/;
const sourceAdminReferencePattern = /^src\/admin\//;
const freeAdminEntryReferences = new Set([
  'src/admin/index.free.js',
  'src/admin/free-stubs/AdminApp.js',
  'src/admin/free-stubs/AppSidebar.js',
  'src/admin/free-stubs/OverviewPanel.js',
]);
const premiumOnlyReferenceNames = [
  ['Premium', 'Lock', 'State'].join(''),
  ['Pwa', 'Stats', 'App', 'Card'].join(''),
  ['Events', 'Panel'].join(''),
  ['Geo', 'Cities', 'Panel'].join(''),
  ['Page', 'Details', 'Geo', 'Cities', 'Card'].join(''),
];
const premiumOnlyReferencePattern = new RegExp(`(?:^src\\/admin\\/premium\\/|${premiumOnlyReferenceNames.join('|')})`);
const packageTarget = process.env.BBPA_PACKAGE_TARGET || 'premium';

const normalizeReference = (reference) => reference.replace(/:\d+(?::\d+)?$/, '');

const collectMappedReferences = (languagesDir = defaultLanguagesDir) => {
  if (!fs.existsSync(languagesDir)) {
    return [];
  }

  const references = new Set();

  fs.readdirSync(languagesDir)
    .filter((fileName) => /^bimbeau-privacy-analytics-(?:.+\.po|pot)$/.test(fileName))
    .forEach((fileName) => {
      const filePath = path.join(languagesDir, fileName);
      const content = fs.readFileSync(filePath, 'utf8');

      content.split(/\r?\n/).forEach((line) => {
        const match = poReferencePattern.exec(line);
        if (!match) {
          return;
        }

        match[1].split(/\s+/)
          .map(normalizeReference)
          .filter((reference) => sourceAdminReferencePattern.test(reference))
          .filter((reference) => javascriptReferencePattern.test(reference))
          .filter((reference) => packageTarget !== 'free' || freeAdminEntryReferences.has(reference) || !premiumOnlyReferencePattern.test(reference))
          .forEach((reference) => references.add(reference));
      });
    });

  return [...references].sort((a, b) => a.localeCompare(b));
};

const createI18nJsonMap = ({ languagesDir = defaultLanguagesDir, bundlePath = adminBundlePath } = {}) => {
  const mappedReferences = collectMappedReferences(languagesDir);

  return mappedReferences.reduce((map, reference) => {
    map[reference] = bundlePath;
    return map;
  }, {});
};

const run = () => {
  const map = createI18nJsonMap();
  process.stdout.write(JSON.stringify(map));
};

if (require.main === module) {
  run();
}

module.exports = {
  adminBundlePath,
  collectMappedReferences,
  createI18nJsonMap,
};
