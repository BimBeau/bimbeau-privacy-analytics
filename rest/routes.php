<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * REST API routes for BimBeau Privacy Analytics.
 */

defined('ABSPATH') || exit;

/**
 * REST controller files required by this routes bootstrap.
 *
 * @return array<string, string>
 */
function bbpa_rest_controller_files(): array
{
    $files = [
        'BBPA_Hit_Controller' => 'includes/rest/class-bbpa-hit-controller.php',
        'BBPA_Admin_Controller' => 'includes/rest/class-bbpa-admin-controller.php',
        'BBPA_REST_Query_Helpers' => 'includes/rest/class-bbpa-rest-query-helpers.php',
        'BBPA_Report_Controller' => 'includes/rest/class-bbpa-report-controller.php',
    ];

    /**
     * Filter REST controller file mappings before the bootstrap loads controllers.
     *
     * Pro-only controllers are registered from premium-only files so the shared
     * Free runtime stays free of Pro controller traces.
     *
     * @param array<string, string> $files Controller class names mapped to plugin-relative paths.
     */
    return apply_filters('bbpa_rest_controller_files', $files);
}

/**
 * Load a REST controller class and verify that the class is available.
 */
function bbpa_load_rest_controller(string $class): bool
{
    if (class_exists($class, false)) {
        return true;
    }

    $controller_files = bbpa_rest_controller_files();
    if (!isset($controller_files[$class])) {
        return false;
    }

    try {
        $controller_file = bbpa_safe_existing_file(BBPA_PATH, $controller_files[$class]);
        require $controller_file;
    } catch (Throwable $exception) {
        if (function_exists('error_log')) {
            error_log(
                'BimBeau Privacy Analytics REST bootstrap could not load controller file for class '
                . $class
                . ': '
                . $exception->getMessage()
            );
        }

        return false;
    }

    if (class_exists($class, false)) {
        return true;
    }

    if (function_exists('error_log')) {
        error_log('BimBeau Privacy Analytics REST bootstrap could not load controller class: ' . $class);
    }

    return false;
}

/**
 * Load the REST controllers needed before route registration.
 *
 * @return array<string, bool>
 */
function bbpa_load_rest_controllers(): array
{
    $loaded = [];

    foreach (array_keys(bbpa_rest_controller_files()) as $class) {
        $loaded[$class] = bbpa_load_rest_controller($class);
    }

    return $loaded;
}

bbpa_safe_require_once(BBPA_PATH, 'includes/rest/security.php');
bbpa_load_rest_controllers();

/**
 * Fires after REST controller file mappings are loaded.
 */
do_action('bbpa_rest_controllers_loaded');

add_action('rest_api_init', static function (): void {
    if (!bbpa_load_rest_controller('BBPA_REST_Query_Helpers')) {
        if (function_exists('error_log')) {
            error_log('BimBeau Privacy Analytics REST bootstrap could not load required helper class: BBPA_REST_Query_Helpers');
        }

        return;
    }

    $controllers = [
        'BBPA_Hit_Controller',
        'BBPA_Admin_Controller',
        'BBPA_Report_Controller',
    ];

    /**
     * Filter REST controller classes before route registration.
     *
     * Pro-only controllers are appended from premium-only files so the shared
     * Free runtime stays free of Pro controller traces.
     *
     * @param array<int, string> $controllers REST controller class names.
     */
    $controllers = apply_filters('bbpa_rest_controller_classes', $controllers);

    foreach ($controllers as $controller_class) {
        if (!bbpa_load_rest_controller($controller_class)) {
            continue;
        }

        $controller = new $controller_class();
        $controller->register_routes();
    }

    do_action('bbpa_register_rest_sources', BBPA_REST_INTERNAL_NAMESPACE, BBPA_REST_NAMESPACE);
});
