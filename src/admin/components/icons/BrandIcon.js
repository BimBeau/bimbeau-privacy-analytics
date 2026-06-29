import {
	TbBrandAndroid,
	TbBrandApple,
	TbBrandChrome,
	TbBrandEdge,
	TbBrandFirefox,
	TbBrandUbuntu,
	TbBrandOpera,
	TbBrandSafari,
	TbBrandWindows,
	TbBrowser,
	TbDeviceDesktop,
	TbDeviceMobile,
	TbDeviceTablet,
	TbQuestionMark,
	TbRobot,
} from 'react-icons/tb';
import { LuFlag, LuMaximize } from 'react-icons/lu';

const normalizeValue = ( value ) =>
	String( value || '' )
		.trim()
		.toLowerCase();

const getDeviceIcon = ( value ) => {
	const normalizedValue = normalizeValue( value );

	if (
		normalizedValue.includes( 'mobile' ) ||
		normalizedValue.includes( 'phone' )
	) {
		return TbDeviceMobile;
	}

	if ( normalizedValue.includes( 'tablet' ) ) {
		return TbDeviceTablet;
	}

	if ( normalizedValue.includes( 'desktop' ) ) {
		return TbDeviceDesktop;
	}

	if (
		normalizedValue.includes( 'computer' ) ||
		normalizedValue.includes( 'pc' ) ||
		normalizedValue.includes( 'ordinateur' )
	) {
		return TbDeviceDesktop;
	}

	if (
		normalizedValue.includes( 'bot' ) ||
		normalizedValue.includes( 'robot' ) ||
		normalizedValue.includes( 'crawler' ) ||
		normalizedValue.includes( 'spider' )
	) {
		return TbRobot;
	}

	return TbQuestionMark;
};

const getOperatingSystemIcon = ( value ) => {
	const normalizedValue = normalizeValue( value );

	if ( normalizedValue.includes( 'windows' ) ) {
		return TbBrandWindows;
	}

	if ( normalizedValue.includes( 'android' ) ) {
		return TbBrandAndroid;
	}

	if (
		normalizedValue.includes( 'ios' ) ||
		normalizedValue.includes( 'mac os' ) ||
		normalizedValue.includes( 'macos' )
	) {
		return TbBrandApple;
	}

	if ( normalizedValue.includes( 'linux' ) ) {
		return TbBrandUbuntu;
	}

	return TbQuestionMark;
};

const getBrowserIcon = ( value ) => {
	const normalizedValue = normalizeValue( value );

	if ( normalizedValue.includes( 'edge' ) ) {
		return TbBrandEdge;
	}

	if (
		normalizedValue.includes( 'chrome' ) ||
		normalizedValue.includes( 'chromium' )
	) {
		return TbBrandChrome;
	}

	if ( normalizedValue.includes( 'firefox' ) ) {
		return TbBrandFirefox;
	}

	if ( normalizedValue.includes( 'safari' ) ) {
		return TbBrandSafari;
	}

	if ( normalizedValue.includes( 'opera' ) ) {
		return TbBrandOpera;
	}

	if ( normalizedValue ) {
		return TbBrowser;
	}

	return TbQuestionMark;
};

const BrandIcon = ( { kind, value, className, size = 16 } ) => {
	let IconComponent = TbQuestionMark;

	if ( kind === 'device' ) {
		IconComponent = getDeviceIcon( value );
	} else if ( kind === 'resolution' ) {
		IconComponent = LuMaximize;
	} else if ( kind === 'os' ) {
		IconComponent = getOperatingSystemIcon( value );
	} else if ( kind === 'browser' ) {
		IconComponent = getBrowserIcon( value );
	} else if ( kind === 'country' ) {
		IconComponent = LuFlag;
	}

	return (
		<IconComponent
			className={ className }
			size={ size }
			aria-hidden="true"
		/>
	);
};

export default BrandIcon;
