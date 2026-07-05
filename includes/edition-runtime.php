<?php

if (!defined('ABSPATH')) {
    exit;
}

$bbpa_premium_bootstrap = BBPA_PATH . 'includes/pro-bootstrap.php';
if (is_readable($bbpa_premium_bootstrap)) {
    require_once $bbpa_premium_bootstrap;
}
