#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const defaultLanguagesDir = path.join(repoRoot, 'languages');
const expectedLocales = [
  'en_US',
  'fr_FR',
  'de_DE',
  'es_ES',
  'pt_PT',
  'it_IT',
  'tr_TR',
  'nl_NL',
  'sv_SE',
  'da_DK',
  'el_GR',
  'zh_CN',
];

const toRelativePath = (filePath) => path.relative(repoRoot, filePath) || '.';

const localeFromPoFile = (fileName) => {
  const match = /^bimbeau-privacy-analytics-(.+)\.po$/.exec(fileName);
  return match ? match[1] : null;
};

const collectPoLocales = (languagesDir) => {
  if (!fs.existsSync(languagesDir)) {
    return [];
  }

  return fs.readdirSync(languagesDir)
    .map(localeFromPoFile)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
};

const parseExpectedLocales = (value) => {
  if (!value) {
    return [...expectedLocales];
  }

  return value
    .split(/[\s,]+/)
    .map((locale) => locale.trim())
    .filter(Boolean);
};

const checkI18nMoFiles = ({
  languagesDir = defaultLanguagesDir,
  expected = expectedLocales,
} = {}) => {
  const poLocales = collectPoLocales(languagesDir);
  const actualLocaleSet = new Set(poLocales);
  const expectedLocaleSet = new Set(expected);
  const allLocales = [...new Set([...expected, ...poLocales])].sort((a, b) => a.localeCompare(b));
  const missingPoLocales = expected.filter((locale) => !actualLocaleSet.has(locale));
  const missingMoLocales = [];
  const emptyMoLocales = [];

  allLocales.forEach((locale) => {
    const moFile = path.join(languagesDir, `bimbeau-privacy-analytics-${locale}.mo`);

    if (!fs.existsSync(moFile)) {
      missingMoLocales.push(locale);
      return;
    }

    if (fs.statSync(moFile).size === 0) {
      emptyMoLocales.push(locale);
    }
  });

  const generatedMoFiles = fs.existsSync(languagesDir)
    ? fs.readdirSync(languagesDir).filter((fileName) => /^bimbeau-privacy-analytics-.+\.mo$/.test(fileName))
    : [];

  const unexpectedPoLocales = poLocales.filter((locale) => !expectedLocaleSet.has(locale));
  const ok = generatedMoFiles.length > 0
    && missingPoLocales.length === 0
    && missingMoLocales.length === 0
    && emptyMoLocales.length === 0;

  return {
    ok,
    languagesDir,
    poLocales,
    expected,
    generatedMoFiles: generatedMoFiles.sort((a, b) => a.localeCompare(b)),
    missingPoLocales,
    missingMoLocales,
    emptyMoLocales,
    unexpectedPoLocales,
  };
};

const formatList = (items) => (items.length > 0 ? items.join(', ') : 'none');

const printReport = (result) => {
  console.log('i18n: verifying PO/MO locale coverage');
  console.log(`i18n: languages directory ${toRelativePath(result.languagesDir)}`);
  console.log(`i18n: expected locales ${formatList(result.expected)}`);
  console.log(`i18n: PO locales ${formatList(result.poLocales)}`);
  console.log(`i18n: generated MO files ${formatList(result.generatedMoFiles)}`);

  if (result.unexpectedPoLocales.length > 0) {
    console.log(`i18n: additional PO locales with required MO coverage ${formatList(result.unexpectedPoLocales)}`);
  }

  if (result.generatedMoFiles.length === 0) {
    console.error('Error: no compiled MO files were generated in languages/.');
  }

  if (result.missingPoLocales.length > 0) {
    console.error(`Error: missing expected PO locale(s): ${formatList(result.missingPoLocales)}.`);
  }

  if (result.missingMoLocales.length > 0) {
    console.error(`Error: missing MO file(s) for locale(s): ${formatList(result.missingMoLocales)}.`);
  }

  if (result.emptyMoLocales.length > 0) {
    console.error(`Error: empty MO file(s) for locale(s): ${formatList(result.emptyMoLocales)}.`);
  }
};

const run = () => {
  const result = checkI18nMoFiles({
    expected: parseExpectedLocales(process.env.BBPA_I18N_EXPECTED_LOCALES),
  });

  printReport(result);
  process.exitCode = result.ok ? 0 : 1;
};

if (require.main === module) {
  run();
}

module.exports = {
  checkI18nMoFiles,
  collectPoLocales,
  expectedLocales,
  parseExpectedLocales,
};
