<?php
/**
 * Free wp-admin permissions runtime.
 *
 * @package BimBeauPrivacyAnalytics
 */

function bbpa_current_user_can_view_analytics(): bool
{
    return current_user_can('manage_options');
}
