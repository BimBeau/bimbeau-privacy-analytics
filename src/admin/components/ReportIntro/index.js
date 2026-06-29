import { createElement } from '@wordpress/element';

/**
 * Shared reporting panel introduction layout.
 * Use this component for report-panel intro copy so icons, spacing, and
 * responsive wrapping stay consistent across future reporting panels.
 *
 * @param {Object}        root0           Component props.
 * @param {Function|null} root0.icon      Icon component to render before the copy.
 * @param {*}             root0.children  Intro copy.
 * @param {string}        root0.className Additional CSS classes.
 */
const ReportIntro = ( { icon: Icon, children, className = '' } ) => {
	const classes = [ 'bbpa-report-panel__intro', className ]
		.filter( Boolean )
		.join( ' ' );

	return createElement(
		'div',
		{ className: classes },
		Icon
			? createElement( Icon, { 'aria-hidden': true, focusable: 'false' } )
			: null,
		createElement( 'p', null, children )
	);
};

export default ReportIntro;
