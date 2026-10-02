/**
 * Runtime admin configuration accessors.
 *
 * PHP prints the admin payload as `window.BBPAAdmin` and the debug flag as
 * `window.BBPA_DEBUG` before the admin bundle runs. Helpers that do not
 * receive the configuration object (date formatting, error screens) read
 * these globals through the accessors below, at call time, instead of reading
 * them directly in every module.
 */

/**
 * Return the admin payload printed by PHP.
 *
 * @return {Object|null} Admin configuration, or null outside the admin.
 */
export const getAdminConfig = () =>
	( typeof window !== 'undefined' && window.BBPAAdmin ) || null;

/**
 * Tell whether admin debug logging is enabled.
 *
 * `window.BBPA_DEBUG` is printed by PHP and updated by the Settings screen
 * when the debug setting is saved, so it wins over the payload setting. The
 * value is read at call time: callers see a change without a page reload.
 *
 * @param {Object|null} config Admin configuration (defaults to the global one).
 * @return {boolean} Whether debug logging is enabled.
 */
export const isAdminDebugEnabled = ( config = getAdminConfig() ) => {
	const debugFlag =
		typeof window !== 'undefined' ? window.BBPA_DEBUG : undefined;

	return Boolean( debugFlag ?? config?.settings?.debugEnabled );
};
