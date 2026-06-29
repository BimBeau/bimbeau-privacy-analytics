#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  collectPoLocales,
} = require('./check-i18n-mo-files');
const {
  collectJsonMessages,
  jsonFileNameForTarget,
} = require('./check-i18n-json-files');

const repoRoot = path.resolve(__dirname, '..');
const languagesDir = path.join(repoRoot, 'languages');
const generatedBundleTarget = 'assets/js/admin.js';
const runtimeTargets = [
  'assets/js/admin.js',
  'build/admin.js',
  'bbpa-admin',
];

const toRelativePath = (filePath) => path.relative(repoRoot, filePath) || '.';

const readJsonFile = (jsonFile) => JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const sortObjectByKey = (objectValue) => Object.fromEntries(
  Object.keys(objectValue)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => [key, objectValue[key]])
);

const normalizeRuntimeJson = (parsedJson) => {
  const localeData = parsedJson.locale_data || {};

  ['bimbeau-privacy-analytics', 'messages'].forEach((domainKey) => {
    const messages = localeData[domainKey];

    if (messages && typeof messages === 'object' && !Array.isArray(messages)) {
      localeData[domainKey] = sortObjectByKey(messages);
    }
  });

  return parsedJson;
};

const countJsonMessages = (jsonFile) => collectJsonMessages([jsonFile]).size;
const isMappedBundleSource = (jsonFile) => {
  try {
    const source = readJsonFile(jsonFile).source || '';
    return typeof source === 'string' && source.startsWith('assets/js/') && source !== generatedBundleTarget;
  } catch (error) {
    return false;
  }
};

const findSourceJsonFile = (targetLanguagesDir, locale, sourceTarget) => {
  const preferredFile = path.join(targetLanguagesDir, jsonFileNameForTarget(locale, sourceTarget));
  const candidates = fs.readdirSync(targetLanguagesDir)
    .filter((fileName) => fileName.startsWith(`bimbeau-privacy-analytics-${locale}-`) && fileName.endsWith('.json'))
    .map((fileName) => path.join(targetLanguagesDir, fileName))
    .filter((jsonFile) => !runtimeTargets.some((target) => jsonFile === path.join(targetLanguagesDir, jsonFileNameForTarget(locale, target))))
    .filter(isMappedBundleSource)
    .map((jsonFile) => ({ jsonFile, messageCount: countJsonMessages(jsonFile) }))
    .sort((a, b) => b.messageCount - a.messageCount || a.jsonFile.localeCompare(b.jsonFile));

  return candidates.length > 0 ? candidates[0].jsonFile : preferredFile;
};

const syncRuntimeJsonFiles = ({ sourceTarget = generatedBundleTarget, targets = runtimeTargets, languagesDir: targetLanguagesDir = languagesDir } = {}) => {
  const copiedFiles = [];
  const removedSourceFiles = [];

  collectPoLocales(targetLanguagesDir).forEach((locale) => {
    const sourceFile = findSourceJsonFile(targetLanguagesDir, locale, sourceTarget);

    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Missing generated source JSON ${toRelativePath(sourceFile)}.`);
    }

    const targetFiles = targets.map((target) => ({
      target,
      targetFile: path.join(targetLanguagesDir, jsonFileNameForTarget(locale, target)),
    }));

    targetFiles.forEach(({ target, targetFile }) => {
      const parsedJson = normalizeRuntimeJson(readJsonFile(sourceFile));
      parsedJson.source = target;
      fs.writeFileSync(targetFile, `${JSON.stringify(parsedJson, null, 2)}\n`);
      copiedFiles.push(toRelativePath(targetFile));
    });

    if (!targetFiles.some(({ targetFile }) => targetFile === sourceFile)) {
      fs.unlinkSync(sourceFile);
      removedSourceFiles.push(toRelativePath(sourceFile));
    }
  });

  return { copiedFiles, removedSourceFiles };
};

const run = () => {
  const { copiedFiles, removedSourceFiles } = syncRuntimeJsonFiles();
  console.log(`i18n: synchronized runtime JS JSON files ${copiedFiles.length}`);
  copiedFiles.forEach((filePath) => console.log(`i18n: ${filePath}`));
  if (removedSourceFiles.length > 0) {
    console.log(`i18n: removed transient mapped source JSON files ${removedSourceFiles.length}`);
    removedSourceFiles.forEach((filePath) => console.log(`i18n: removed ${filePath}`));
  }
};

if (require.main === module) {
  run();
}

module.exports = {
  findSourceJsonFile,
  syncRuntimeJsonFiles,
};
