#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  collectPoLocales,
  expectedLocales,
  parseExpectedLocales,
} = require('./check-i18n-mo-files');

const repoRoot = path.resolve(__dirname, '..');
const defaultLanguagesDir = path.join(repoRoot, 'languages');
const domain = 'bimbeau-privacy-analytics';
const runtimeJsonTargets = [
  'assets/js/admin.js',
  'build/admin.js',
  'bbpa-admin',
];

const javascriptReferencePattern = /\.(?:m?js|jsx|ts|tsx)(?::\d+)?$/;

const toRelativePath = (filePath) => path.relative(repoRoot, filePath) || '.';
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');

const parsePoString = (line) => {
  const match = /"(?:\\.|[^"\\])*"/.exec(line);
  if (!match) {
    return '';
  }

  return JSON.parse(match[0]);
};

const finalizePoEntry = (entries, entry) => {
  if (!entry || !entry.msgid) {
    return;
  }

  entries.push({
    references: entry.references || [],
    msgid: entry.msgid || '',
    msgidPlural: entry.msgidPlural || '',
  });
};

const parsePoEntries = (filePath) => {
  const entries = [];
  let entry = { references: [] };
  let activeField = null;

  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
    if (line.trim() === '') {
      finalizePoEntry(entries, entry);
      entry = { references: [] };
      activeField = null;
      return;
    }

    if (line.startsWith('#:')) {
      entry.references.push(...line.slice(2).trim().split(/\s+/).filter(Boolean));
      return;
    }

    if (line.startsWith('msgid_plural ')) {
      entry.msgidPlural = parsePoString(line);
      activeField = 'msgidPlural';
      return;
    }

    if (line.startsWith('msgid ')) {
      entry.msgid = parsePoString(line);
      activeField = 'msgid';
      return;
    }

    if (line.startsWith('msgstr')) {
      activeField = null;
      return;
    }

    if (line.startsWith('"') && activeField) {
      entry[activeField] = `${entry[activeField] || ''}${parsePoString(line)}`;
    }
  });

  finalizePoEntry(entries, entry);
  return entries;
};

const hasJavaScriptReference = (entry) => entry.references.some((reference) => (
  javascriptReferencePattern.test(reference.replace(/:\d+(?::\d+)?$/, ''))
));

const collectJsMsgids = (poFile) => {
  const msgids = new Set();

  parsePoEntries(poFile)
    .filter(hasJavaScriptReference)
    .forEach((entry) => {
      msgids.add(entry.msgid);
    });

  return [...msgids].sort((a, b) => a.localeCompare(b));
};

const collectJsonMessages = (jsonFiles) => {
  const messages = new Set();

  jsonFiles.forEach((jsonFile) => {
    const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    const localeData = parsed.locale_data || {};
    const domainData = localeData[domain] || localeData.messages || {};

    Object.keys(domainData)
      .filter((msgid) => msgid !== '')
      .forEach((msgid) => {
        messages.add(msgid);
        // WordPress stores contextual gettext keys as "context\u0004msgid".
        // PO coverage is collected by msgid, so include the unqualified value.
        if (msgid.includes('\u0004')) {
          messages.add(msgid.slice(msgid.lastIndexOf('\u0004') + 1));
        }
      });
  });

  return messages;
};

const jsonFileNameForTarget = (locale, target) => {
  const suffix = target.endsWith('.js') ? md5(target) : target;
  return `${domain}-${locale}-${suffix}.json`;
};

const checkI18nJsonFiles = ({
  languagesDir = defaultLanguagesDir,
  expected = expectedLocales,
  runtimeTargets = runtimeJsonTargets,
} = {}) => {
  const poLocales = collectPoLocales(languagesDir);
  const allLocales = [...new Set([...expected, ...poLocales])].sort((a, b) => a.localeCompare(b));
  const missingPoLocales = expected.filter((locale) => !poLocales.includes(locale));
  const missingJsonLocales = [];
  const missingRuntimeJsonFiles = [];
  const missingJsMessages = [];
  const localeReports = [];

  allLocales.forEach((locale) => {
    const poFile = path.join(languagesDir, `${domain}-${locale}.po`);
    const localeJsonFiles = fs.existsSync(languagesDir)
      ? fs.readdirSync(languagesDir)
        .filter((fileName) => fileName.startsWith(`${domain}-${locale}-`) && fileName.endsWith('.json'))
        .map((fileName) => path.join(languagesDir, fileName))
      : [];
    const expectedRuntimeFiles = runtimeTargets.map((target) => path.join(languagesDir, jsonFileNameForTarget(locale, target)));
    const missingRuntimeForLocale = expectedRuntimeFiles.filter((jsonFile) => !fs.existsSync(jsonFile));
    const jsMsgids = fs.existsSync(poFile) ? collectJsMsgids(poFile) : [];
    const runtimeJsonFiles = expectedRuntimeFiles.filter((jsonFile) => fs.existsSync(jsonFile));
    const runtimeMessages = collectJsonMessages(runtimeJsonFiles);
    const missingMessages = jsMsgids.filter((msgid) => !runtimeMessages.has(msgid));

    if (localeJsonFiles.length === 0) {
      missingJsonLocales.push(locale);
    }

    if (missingRuntimeForLocale.length > 0) {
      missingRuntimeJsonFiles.push(...missingRuntimeForLocale.map(toRelativePath));
    }

    if (missingMessages.length > 0) {
      missingJsMessages.push({ locale, messages: missingMessages });
    }

    localeReports.push({
      locale,
      jsonFiles: localeJsonFiles.map(toRelativePath).sort((a, b) => a.localeCompare(b)),
      runtimeJsonFiles: runtimeJsonFiles.map(toRelativePath).sort((a, b) => a.localeCompare(b)),
      jsMessageCount: jsMsgids.length,
      missingMessages,
    });
  });

  return {
    ok: missingPoLocales.length === 0
      && missingJsonLocales.length === 0
      && missingRuntimeJsonFiles.length === 0
      && missingJsMessages.length === 0,
    languagesDir,
    expected,
    poLocales,
    runtimeTargets,
    localeReports,
    missingPoLocales,
    missingJsonLocales,
    missingRuntimeJsonFiles: missingRuntimeJsonFiles.sort((a, b) => a.localeCompare(b)),
    missingJsMessages,
  };
};

const formatList = (items) => (items.length > 0 ? items.join(', ') : 'none');

const printReport = (result) => {
  console.log('i18n: verifying JS JSON locale coverage');
  console.log(`i18n: languages directory ${toRelativePath(result.languagesDir)}`);
  console.log(`i18n: expected locales ${formatList(result.expected)}`);
  console.log(`i18n: PO locales ${formatList(result.poLocales)}`);
  console.log(`i18n: runtime JSON targets ${formatList(result.runtimeTargets)}`);

  result.localeReports.forEach((report) => {
    console.log(`i18n: ${report.locale} JSON files ${report.jsonFiles.length}; runtime JSON files ${report.runtimeJsonFiles.length}; JS strings ${report.jsMessageCount}`);
  });

  if (result.missingPoLocales.length > 0) {
    console.error(`Error: missing expected PO locale(s): ${formatList(result.missingPoLocales)}.`);
  }

  if (result.missingJsonLocales.length > 0) {
    console.error(`Error: missing JS JSON file(s) for locale(s): ${formatList(result.missingJsonLocales)}.`);
  }

  if (result.missingRuntimeJsonFiles.length > 0) {
    console.error(`Error: missing runtime JS JSON file(s): ${formatList(result.missingRuntimeJsonFiles)}.`);
  }

  result.missingJsMessages.forEach(({ locale, messages }) => {
    console.error(`Error: ${locale} runtime JS JSON misses ${messages.length} PO JS string(s): ${formatList(messages.slice(0, 20))}${messages.length > 20 ? ', …' : ''}.`);
  });
};

const run = () => {
  const result = checkI18nJsonFiles({
    expected: parseExpectedLocales(process.env.BBPA_I18N_EXPECTED_LOCALES),
  });

  printReport(result);
  process.exitCode = result.ok ? 0 : 1;
};

if (require.main === module) {
  run();
}

module.exports = {
  checkI18nJsonFiles,
  collectJsMsgids,
  collectJsonMessages,
  jsonFileNameForTarget,
  parsePoEntries,
  runtimeJsonTargets,
};
