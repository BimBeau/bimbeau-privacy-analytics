#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="${repo_root}/dist"
plugin_slug="bimbeau-privacy-analytics"

log_phase() {
  printf '\n==> %s\n' "$*"
}

run_phase() {
  local phase_name="$1"
  local exit_code
  shift

  log_phase "Starting ${phase_name}"

  set +e
  "$@"
  exit_code="$?"
  set -e

  if [ "${exit_code}" -eq 0 ]; then
    log_phase "Completed ${phase_name}"
    return 0
  fi

  log_phase "Failed ${phase_name} (exit code ${exit_code})"
  return "${exit_code}"
}

build_front_assets() {
  local admin_bundle_path="${repo_root}/build/admin.js"
  local skip_front_build="${SKIP_FRONT_BUILD:-false}"

  log_phase "Preparing front-end asset build"

  if [ "${skip_front_build}" = "true" ]; then
    if [ ! -f "${admin_bundle_path}" ]; then
      echo "Front build cache requested but missing artifact: ${admin_bundle_path}" >&2
      return 1
    fi

    run_phase "cached admin bundle synchronization verification" \
      node "${repo_root}/scripts/verify-admin-bundle-sync.js" \
      --source "src/admin/panels/TopPagesPanel.js" \
      --bundle "build/admin.js" \
      --label "build/admin.js" \
      --tier "${BBPA_PACKAGE_TARGET:-free}"

    echo "Skipping npm build because cached front bundle passed integrity checks."
    return 0
  fi

  rm -f "${admin_bundle_path}"

  local admin_source_root="${repo_root}/src/admin"
  local stripped_source_root=""
  if [ "${BBPA_PACKAGE_TARGET:-free}" = "free" ]; then
    stripped_source_root="$(mktemp -d)"
    rsync -a --delete "${repo_root}/src/admin/" "${stripped_source_root}/admin/"
    node "${repo_root}/scripts/strip-freemius-premium-blocks.js" "${stripped_source_root}/admin"
    admin_source_root="${stripped_source_root}/admin"
  fi

  local npm_build_log="${dist_dir}/build-assets-${BBPA_PACKAGE_TARGET:-free}.log"
  log_phase "Starting front-end asset compilation (npm run build:assets)"
  mkdir -p "$(dirname "${npm_build_log}")"

  set +e
  env \
    BBPA_ADMIN_SOURCE_ROOT="${admin_source_root}" \
    BBPA_PACKAGE_TARGET="${BBPA_PACKAGE_TARGET:-free}" \
    NODE_OPTIONS="${NODE_OPTIONS:-} --trace-uncaught --trace-warnings" \
    npm --prefix "${repo_root}" run build:assets 2>&1 | tee "${npm_build_log}"
  local build_exit_code="${PIPESTATUS[0]}"
  set -e

  if [ "${build_exit_code}" -eq 0 ]; then
    log_phase "Completed front-end asset compilation (npm run build:assets)"
  else
    log_phase "Failed front-end asset compilation (npm run build:assets) (exit code ${build_exit_code})"
    echo "npm build log: ${npm_build_log}" >&2
    echo "build/admin.js exists: $([ -f "${admin_bundle_path}" ] && echo yes || echo no)" >&2
    echo "Last 200 lines from npm build log:" >&2
    tail -n 200 "${npm_build_log}" >&2 || true

    if [ -n "${stripped_source_root}" ]; then
      rm -rf "${stripped_source_root}"
    fi

    return "${build_exit_code}"
  fi

  if [ -n "${stripped_source_root}" ]; then
    rm -rf "${stripped_source_root}"
  fi

  if [ ! -f "${admin_bundle_path}" ]; then
    echo "Missing expected front build artifact: ${admin_bundle_path}" >&2
    return 1
  fi

  run_phase "admin bundle synchronization verification" \
    node "${repo_root}/scripts/verify-admin-bundle-sync.js" \
    --source "src/admin/panels/TopPagesPanel.js" \
    --bundle "build/admin.js" \
    --label "build/admin.js" \
    --tier "${BBPA_PACKAGE_TARGET:-free}"
}

build_zip() {
  local source_root="$1"
  local source_slug="$2"
  local output_file="$3"

  rm -f "${output_file}"

  (
    cd "${source_root}"
    {
      printf '%s\n' "${source_slug}"
      find "${source_slug}" -mindepth 1 -print | LC_ALL=C sort
    } | zip -q -X "${output_file}" -@
  )
}

validate_zip_root() {
  local zip_path="$1"
  local expected_root="$2"

  local root_count
  root_count="$(zipinfo -1 "${zip_path}" | awk -F/ 'NF > 0 {print $1}' | sort -u | wc -l | tr -d ' ')"

  if [ "${root_count}" -ne 1 ]; then
    echo "Invalid ZIP root count in ${zip_path}: ${root_count}" >&2
    return 1
  fi

  local actual_root
  actual_root="$(zipinfo -1 "${zip_path}" | awk -F/ 'NF > 0 && first == "" { first = $1 } END { print first }')"

  if [ "${actual_root}" != "${expected_root}" ]; then
    echo "Invalid ZIP root in ${zip_path}: expected ${expected_root}, got ${actual_root}" >&2
    return 1
  fi
}

validate_zip_main_file() {
  local zip_path="$1"
  local expected_file="$2"

  if ! zipinfo -1 "${zip_path}" | awk -v target="${expected_file}" 'BEGIN { found = 0 } $0 == target { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "Missing required plugin file in ${zip_path}: ${expected_file}" >&2
    return 1
  fi
}

ensure_free_runtime_callbacks() {
  if [ "${BBPA_PACKAGE_TARGET:-free}" != "free" ]; then
    return 0
  fi

  node "${repo_root}/scripts/ensure-free-runtime-callbacks.js" \
    "${repo_root}" \
    "${temp_dir}/${plugin_slug}"
}

log_phase "Preparing distribution directory: ${dist_dir}"
mkdir -p "${dist_dir}"

temp_dir="$(mktemp -d)"
trap 'rm -rf "${temp_dir}"' EXIT

build_front_assets
run_phase "plugin distribution staging (build-plugin-dist.sh)" \
  env BBPA_PACKAGE_TARGET="${BBPA_PACKAGE_TARGET:-free}" "${repo_root}/scripts/build-plugin-dist.sh" "${temp_dir}"
run_phase "Free runtime callback preservation" \
  ensure_free_runtime_callbacks

plugin_zip="${dist_dir}/${plugin_slug}.zip"

run_phase "plugin ZIP archive creation" \
  build_zip "${temp_dir}" "${plugin_slug}" "${plugin_zip}"
run_phase "plugin ZIP root validation" \
  validate_zip_root "${plugin_zip}" "${plugin_slug}"
run_phase "plugin ZIP main file validation" \
  validate_zip_main_file "${plugin_zip}" "${plugin_slug}/bimbeau-privacy-analytics.php"
run_phase "plugin ZIP entrypoint validation" \
  node "${repo_root}/scripts/verify-plugin-zip-entrypoint.js" "${plugin_zip}"
run_phase "plugin ZIP static include validation" \
  node "${repo_root}/scripts/verify-zip-static-includes.js" "${plugin_zip}"
if [ "${BBPA_PACKAGE_TARGET:-free}" = "free" ]; then
  run_phase "Free package compliance audit" \
    env BBPA_FREE_AUDIT_ALLOW_FREEMIUS_SDK=1 "${repo_root}/scripts/audit-free-package.sh" "${plugin_zip}"
else
  log_phase "Skipping Free package compliance audit for ${BBPA_PACKAGE_TARGET} package target"
fi

echo "Built ${plugin_zip}"
