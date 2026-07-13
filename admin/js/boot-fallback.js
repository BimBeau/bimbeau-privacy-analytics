( function () {
	const config = window.BBPAAdminBootFallback || {};
	const rootId =
		typeof config.rootId === 'string' ? config.rootId : 'bbpa-admin';
	const root = document.getElementById( rootId );

	if ( ! root ) {
		return;
	}

	const fallback = root.querySelector( '.bbpa-admin-boot-fallback' );

	if ( ! fallback ) {
		return;
	}

	const hideFallback = function () {
		if ( ! root.contains( fallback ) ) {
			return;
		}

		const hasRealContent =
			root.childElementCount > 1 || ! root.contains( fallback );

		if ( hasRealContent ) {
			fallback.classList.add( 'is-hidden' );
		}
	};

	if ( document.readyState === 'complete' ) {
		setTimeout( hideFallback, 1200 );
	} else {
		window.addEventListener( 'load', function () {
			setTimeout( hideFallback, 1200 );
		} );
	}
} )();
