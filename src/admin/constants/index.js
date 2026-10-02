/**
 * Admin constants of the wp-admin screens.
 *
 * The shared constants live in `lib/adminConstants.js`; this module adds the
 * panel visibility helpers. Every panel of the Free admin is always enabled.
 */

export * from '../lib/adminConstants';

export const getDisabledPanels = () => [];

export const isPanelEnabled = () => true;
