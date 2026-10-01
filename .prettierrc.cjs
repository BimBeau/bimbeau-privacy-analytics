/**
 * Prettier style of the JavaScript sources: the WordPress coding standards
 * (tabs, single quotes, spaces inside parentheses), which is also the style
 * enforced by the `prettier/prettier` rule of `npm run lint:js`.
 *
 * Declaring it here makes editors and direct Prettier runs use the same style
 * as ESLint instead of the Prettier defaults. Files that are not formatted yet
 * are listed in `.prettierignore`.
 */
// @wordpress/prettier-config is installed by @wordpress/scripts.
// eslint-disable-next-line import/no-extraneous-dependencies
module.exports = require( '@wordpress/prettier-config' );
