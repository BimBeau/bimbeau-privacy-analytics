#!/usr/bin/env bash
set -euo pipefail

# Keep gettext ordering and wrapping independent from the runner locale.
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
languages_dir="${repo_root}/languages"
pot_file="${languages_dir}/bimbeau-privacy-analytics.pot"
exclude_paths="node_modules,build,dist,package-tmp,vendor,tests,docs,assets,assets/js/__tests__"
pot_headers='{"POT-Creation-Date":"","Project-Id-Version":"BimBeau Privacy Analytics","Report-Msgid-Bugs-To":"https://wordpress.org/support/plugin/bimbeau-privacy-analytics"}'
required_commands=(php wp msgmerge msgfmt msgattrib)
missing_commands=()

for required_command in "${required_commands[@]}"; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    missing_commands+=("${required_command}")
  fi
done

if [ "${#missing_commands[@]}" -gt 0 ]; then
  echo "Error: missing required i18n command(s): ${missing_commands[*]}." >&2
  echo "Install npm dependencies with 'npm ci', install WP-CLI so 'wp' is on PATH, and install gettext for msgmerge, msgfmt, and msgattrib." >&2
  exit 1
fi

wp_binary="$(command -v wp)"

# WP-CLI can load host PHP extensions while scanning JavaScript/JSX i18n
# sources. Xdebug's default stack guard can abort the parser before POT, MO,
# or JSON generation completes, so every WP-CLI i18n invocation runs through
# PHP with Xdebug disabled. Exporting XDEBUG_MODE also covers Xdebug 3 before
# PHP parses CLI -d overrides.
export XDEBUG_MODE=off

wp_cmd=(php -d xdebug.mode=off -d xdebug.max_nesting_level=2048 "${wp_binary}")
if [ "$(id -u)" -eq 0 ]; then
  wp_cmd+=(--allow-root)
fi

po_backup_dir="$(mktemp -d)"
po_files_to_restore=()

cleanup_i18n_po_backups() {
  local po_file
  local backup_file

  for po_file in "${po_files_to_restore[@]}"; do
    backup_file="${po_backup_dir}/$(basename "${po_file}")"
    if [ -f "${backup_file}" ]; then
      cp "${backup_file}" "${po_file}"
    fi
  done

  rm -rf "${po_backup_dir}"
}

trap cleanup_i18n_po_backups EXIT

normalize_po_header_escapes() {
  local po_file="$1"

  python3 - "${po_file}" <<'PY'
from pathlib import Path
import sys

po_path = Path(sys.argv[1])
content = po_path.read_text(encoding="utf-8")
header, separator, body = content.partition("\n\n")
normalized_header = header.replace('\\\\n"', '\\n"')

if normalized_header != header:
    po_path.write_text(f"{normalized_header}{separator}{body}", encoding="utf-8")
    print(f"i18n: normalized escaped PO header line endings in {po_path}")
PY
}


normalize_po_source_references() {
  local po_file="$1"

  python3 - "${po_file}" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
content = path.read_text(encoding="utf-8")

def normalize_reference_line(match):
    refs = match.group(1).split()
    normalized = []

    for ref in refs:
        normalized.append(re.sub(r":\d+$", "", ref))

    seen = set()
    unique = []
    for ref in normalized:
        if ref not in seen:
            seen.add(ref)
            unique.append(ref)

    return "#: " + " ".join(unique)

content = re.sub(r"^#: (.+)$", normalize_reference_line, content, flags=re.MULTILINE)
path.write_text(content, encoding="utf-8")
PY
}

prepare_po_for_gettext() {
  local po_file="$1"
  local before_hash
  local after_hash

  before_hash="$(sha256sum "${po_file}" | awk '{print $1}')"
  normalize_po_header_escapes "${po_file}"
  after_hash="$(sha256sum "${po_file}" | awk '{print $1}')"

  if [ "${before_hash}" != "${after_hash}" ]; then
    cp "${po_backup_dir}/$(basename "${po_file}")" "${po_file}.i18n-backup" 2>/dev/null || true
    po_files_to_restore+=("${po_file}")
  fi
}

assert_pot_has_source_references() {
  local required_reference_patterns=(
    '^#:[[:space:]]+([^[:space:]]+[[:space:]]+)*admin/.*\.(php|js|jsx|ts|tsx)'
    '^#:[[:space:]]+([^[:space:]]+[[:space:]]+)*includes/.*\.(php|js|jsx|ts|tsx)'
    '^#:[[:space:]]+([^[:space:]]+[[:space:]]+)*front/.*\.(php|js|jsx|ts|tsx)'
    '^#:[[:space:]]+([^[:space:]]+[[:space:]]+)*src/.*\.(php|js|jsx|ts|tsx)'
    '^#:[[:space:]]+([^[:space:]]+[[:space:]]+)*bimbeau-privacy-analytics\.php'
  )
  local required_source_labels=(
    'admin/'
    'includes/'
    'front/'
    'src/'
    'bimbeau-privacy-analytics.php'
  )
  local missing_source_labels=()
  local pattern_index

  source_label_has_i18n_calls() {
    local source_label="$1"
    local source_path="${repo_root}/${source_label%/}"

    if [ ! -e "${source_path}" ]; then
      return 1
    fi

    if [ -f "${source_path}" ]; then
      grep -Eq "(__|_e|esc_html__|esc_attr__|_x|_n)[[:space:]]*\([^)]*bimbeau-privacy-analytics" "${source_path}"
      return $?
    fi

    find "${source_path}" -type f \( -name '*.php' -o -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \) -print0 \
      | xargs -0 grep -Eq "(__|_e|esc_html__|esc_attr__|_x|_n)[[:space:]]*\([^)]*bimbeau-privacy-analytics"
  }

  for pattern_index in "${!required_reference_patterns[@]}"; do
    if ! source_label_has_i18n_calls "${required_source_labels[${pattern_index}]}"; then
      continue
    fi

    if ! grep -Eq "${required_reference_patterns[${pattern_index}]}" "${pot_file}"; then
      missing_source_labels+=("${required_source_labels[${pattern_index}]}")
    fi
  done

  if [ "${#missing_source_labels[@]}" -gt 0 ]; then
    echo "Error: ${pot_file} does not contain source references for: ${missing_source_labels[*]}." >&2
    echo "The POT must be generated from WordPress PHP and JavaScript i18n calls, not kept as a static template without references." >&2
    exit 1
  fi
}

echo "i18n: repo root ${repo_root}"
echo "i18n: generating POT (${pot_file})"
(cd "${repo_root}" && "${wp_cmd[@]}" i18n make-pot . "${pot_file}" \
  --domain=bimbeau-privacy-analytics \
  --slug=bimbeau-privacy-analytics \
  --exclude="${exclude_paths}" \
  --headers="${pot_headers}" \
  --location=file)

normalize_po_source_references "${pot_file}"
assert_pot_has_source_references

for po_file in "${languages_dir}"/bimbeau-privacy-analytics-*.po; do
  if [ -f "${po_file}" ]; then
    cp "${po_file}" "${po_backup_dir}/$(basename "${po_file}")"
    prepare_po_for_gettext "${po_file}"
    msgmerge --update --backup=none --no-wrap "${po_file}" "${pot_file}"
    normalize_po_source_references "${po_file}"
  fi
done

echo "i18n: generating MO files"
for po_file in "${languages_dir}"/bimbeau-privacy-analytics-*.po; do
  if [ -f "${po_file}" ]; then
    mo_file="${po_file%.po}.mo"
    (cd "${repo_root}" && "${wp_cmd[@]}" i18n make-mo "${po_file}" "${mo_file}")
  fi
done
(cd "${repo_root}" && node scripts/check-i18n-mo-files.js)

echo "i18n: removing stale JS JSON files"
find "${languages_dir}" -maxdepth 1 -type f -name 'bimbeau-privacy-analytics-*.json' -delete

json_map="$(cd "${repo_root}" && node scripts/i18n-json-map.js)"
make_json_cmd=("${wp_cmd[@]}" i18n make-json languages --no-purge --domain=bimbeau-privacy-analytics "--use-map=${json_map}")
echo "i18n: generating JS JSON (${make_json_cmd[*]})"
make_json_output="$(
  cd "${repo_root}" && "${make_json_cmd[@]}" 2>&1
)" || make_json_status=$?
make_json_status="${make_json_status:-0}"

if [ "${make_json_status}" -ne 0 ]; then
  echo "${make_json_output}" >&2
fi

has_js_refs=false
if (cd "${repo_root}" && grep -Eq '^#:\s+.*\.(js|jsx|ts|tsx)' languages/bimbeau-privacy-analytics-*.po); then
  has_js_refs=true
fi

json_sample="$(cd "${repo_root}" && find languages -type f -name '*.json' -print -quit)"
if [ -z "${json_sample}" ]; then
  if [ "${has_js_refs}" = "true" ] || [ "${make_json_status}" -ne 0 ]; then
    echo "Error: no JS translation JSON files were generated." >&2
    echo "Diagnostics: pwd" >&2
    (cd "${repo_root}" && pwd) || true
    echo "Diagnostics: wp i18n make-json --help" >&2
    (cd "${repo_root}" && "${wp_cmd[@]}" i18n make-json --help) || true
    echo "Diagnostics: ls -la languages" >&2
    (cd "${repo_root}" && ls -la languages) || true
    echo "Diagnostics: JS references in languages/bimbeau-privacy-analytics-fr_FR.po" >&2
    if (cd "${repo_root}" && awk '/^#:/ {print; if (++count>=50) exit}' languages/bimbeau-privacy-analytics-fr_FR.po); then
      :
    else
      echo "Note: no JS references found in languages/bimbeau-privacy-analytics-fr_FR.po." >&2
    fi
    exit 1
  else
    echo "Warning: no JS translation JSON files were generated because no JS references were found." >&2
  fi
elif [ "${make_json_status}" -ne 0 ] && [ "${has_js_refs}" = "true" ]; then
  echo "Error: wp i18n make-json failed despite JS references in PO files." >&2
  echo "${make_json_output}" >&2
  exit 1
fi

if [ "${has_js_refs}" = "true" ]; then
  (cd "${repo_root}" && node scripts/sync-i18n-runtime-json.js)
  (cd "${repo_root}" && node scripts/check-i18n-json-files.js)
fi
