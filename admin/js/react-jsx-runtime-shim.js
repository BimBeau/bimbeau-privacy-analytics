/**
 * Minimal `react-jsx-runtime` fallback for WordPress versions older than 6.6.
 *
 * The admin bundle is compiled with the automatic JSX runtime and reads
 * `window.ReactJSXRuntime` (the `react-jsx-runtime` script handle). WordPress
 * core only registers that handle since 6.6, while the plugin supports 6.4.
 * On older versions the plugin registers this file under the same handle; it
 * maps `jsx()` / `jsxs()` onto `React.createElement()` from the core `react`
 * script and never replaces a runtime that is already available.
 *
 * @param {Object} root Global object (window).
 */
( function ( root ) {
	'use strict';

	if ( ! root || root.ReactJSXRuntime ) {
		return;
	}

	const React = root.React;
	if ( ! React || typeof React.createElement !== 'function' ) {
		return;
	}

	const hasOwn = Object.prototype.hasOwnProperty;

	/**
	 * Create a React element from automatic-runtime arguments.
	 *
	 * The automatic runtime passes children inside `config.children` and the
	 * key as a separate third argument. A `key` present in `config` takes
	 * precedence, like in React's own runtime.
	 *
	 * @param {*}      type     Element type.
	 * @param {Object} config   Props, including `children` and `ref`.
	 * @param {*}      maybeKey Optional key passed outside of the props.
	 * @return {Object} React element.
	 */
	const jsx = function ( type, config, maybeKey ) {
		const props = {};

		if ( config ) {
			for ( const name in config ) {
				if ( hasOwn.call( config, name ) ) {
					props[ name ] = config[ name ];
				}
			}
		}

		if ( maybeKey !== undefined && props.key === undefined ) {
			props.key = maybeKey;
		}

		return React.createElement( type, props );
	};

	/**
	 * Create a React element whose children array is static.
	 *
	 * The compiler only emits `jsxs()` for children written side by side in
	 * JSX, which never need keys. Like React's own runtime, mark them as
	 * key-validated so development builds of React (SCRIPT_DEBUG) do not log
	 * "unique key" warnings for them. Production builds have no `_store`.
	 *
	 * @param {*}      type     Element type.
	 * @param {Object} config   Props, including the static `children` array.
	 * @param {*}      maybeKey Optional key passed outside of the props.
	 * @return {Object} React element.
	 */
	const jsxs = function ( type, config, maybeKey ) {
		const children = config ? config.children : undefined;

		if ( Array.isArray( children ) ) {
			children.forEach( function ( child ) {
				if (
					React.isValidElement( child ) &&
					child._store &&
					typeof child._store === 'object'
				) {
					child._store.validated = true;
				}
			} );
		}

		return jsx( type, config, maybeKey );
	};

	root.ReactJSXRuntime = {
		Fragment: React.Fragment,
		jsx,
		jsxs,
	};
} )( typeof window !== 'undefined' ? window : globalThis );
