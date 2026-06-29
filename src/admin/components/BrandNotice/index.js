import { Notice as WordPressNotice } from '@wordpress/components';

const mergeClassNames = ( ...classNames ) =>
	classNames.filter( Boolean ).join( ' ' );

const BPANoticeIcon = () => (
	<svg
		className="bbpa-brand-notice__icon-svg"
		viewBox="0 0 1500 1500"
		focusable="false"
		aria-hidden="true"
		fill="currentColor"
	>
		<rect
			x="275.34"
			y="190.28"
			width="160.36"
			height="320.72"
			transform="translate(854.86 347.19) rotate(135)"
		/>
		<rect
			x="1069.09"
			y="984.02"
			width="160.36"
			height="320.72"
			transform="translate(2771.13 1140.93) rotate(135)"
		/>
		<path d="M932.9,567.01c-96.81-96.81-253.78-96.81-350.59,0s-96.81,253.78,0,350.59c96.81,96.81,253.78,96.81,350.59,0s96.81-253.78,0-350.59ZM706.12,793.8c-28.44-28.44-28.44-74.54,0-102.98,28.44-28.44,74.54-28.44,102.98,0,28.44,28.44,28.44,74.54,0,102.98s-74.54,28.44-102.98,0Z" />
		<rect
			x="982.01"
			y="154.21"
			width="160.36"
			height="567.01"
			transform="translate(620.62 -622.88) rotate(45)"
		/>
		<rect
			x="358.35"
			y="777.87"
			width="160.36"
			height="567.01"
			transform="translate(878.95 .78) rotate(45)"
		/>
	</svg>
);

const BrandNotice = ( {
	children,
	className = '',
	status = 'info',
	...noticeProps
} ) => (
	<WordPressNotice
		{ ...noticeProps }
		status={ status }
		className={ mergeClassNames(
			'bbpa-brand-notice',
			`bbpa-brand-notice--${ status }`,
			className
		) }
	>
		<div className="bbpa-brand-notice__body">
			<span className="bbpa-brand-notice__icon" aria-hidden="true">
				<BPANoticeIcon />
			</span>
			<div className="bbpa-brand-notice__content">{ children }</div>
		</div>
	</WordPressNotice>
);

export { BPANoticeIcon };
export default BrandNotice;
