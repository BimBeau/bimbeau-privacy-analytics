<?php

if (!defined('ABSPATH')) {
    exit;
}

const BBPA_SETUP_WIZARD_OPTION = 'bbpa_setup_wizard_state';
const BBPA_SETUP_WIZARD_SCHEMA_VERSION = 1;

function bbpa_get_setup_wizard_default_state(): array
{
    return [
        'schema_version' => BBPA_SETUP_WIZARD_SCHEMA_VERSION,
        'status' => 'not_started',
        'auto_opened' => false,
        'current_step' => 'tracking',
        'started_at' => null,
        'completed_at' => null,
        'completed_by' => null,
        'wizard_version' => 1,
        'choices' => ['advanced_stats' => null, 'geoip_database' => null, 'referrer_favicons' => null],
        'authorizations' => ['geoip_downloaded_at' => null, 'geoip_downloaded_by' => null, 'favicons_enabled_at' => null, 'favicons_enabled_by' => null],
    ];
}

function bbpa_normalize_setup_wizard_state($state): array
{
    $default = bbpa_get_setup_wizard_default_state();
    $state = is_array($state) ? $state : [];
    $state = wp_parse_args($state, $default);
    $state['schema_version'] = BBPA_SETUP_WIZARD_SCHEMA_VERSION;
    $state['status'] = in_array($state['status'], ['not_started', 'in_progress', 'completed'], true) ? $state['status'] : 'not_started';
    $state['current_step'] = in_array($state['current_step'], ['tracking', 'geolocation', 'referrers', 'complete'], true) ? $state['current_step'] : 'tracking';
    $state['auto_opened'] = (bool) rest_sanitize_boolean($state['auto_opened']);
    $state['wizard_version'] = 1;
    foreach (['started_at', 'completed_at'] as $key) {
        $state[$key] = is_string($state[$key]) && preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', $state[$key]) ? $state[$key] : null;
    }
    $state['completed_by'] = $state['completed_by'] ? absint($state['completed_by']) : null;
    $choices = is_array($state['choices']) ? $state['choices'] : [];
    foreach (array_keys($default['choices']) as $key) {
        $state['choices'][$key] = array_key_exists($key, $choices) && is_bool($choices[$key]) ? $choices[$key] : null;
    }
    $authorizations = is_array($state['authorizations']) ? $state['authorizations'] : [];
    foreach (array_keys($default['authorizations']) as $key) {
        $value = $authorizations[$key] ?? null;
        $state['authorizations'][$key] = str_ends_with($key, '_by') ? ($value ? absint($value) : null) : (is_string($value) && preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', $value) ? $value : null);
    }
    return $state;
}

function bbpa_get_setup_wizard_state(): array
{
    return bbpa_normalize_setup_wizard_state(get_option(BBPA_SETUP_WIZARD_OPTION, []));
}

function bbpa_update_setup_wizard_state(array $state): array
{
    $state = bbpa_normalize_setup_wizard_state($state);
    update_option(BBPA_SETUP_WIZARD_OPTION, $state, false);
    return $state;
}

function bbpa_setup_wizard_auto_open_allowed(array $state): bool
{
    return $state['status'] === 'not_started' && !$state['auto_opened'];
}
