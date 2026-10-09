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

// Device classes stored by the trackers. Callers pass the raw device class,
// not its translated label: a translated label (for example "机器人" for
// "Bot") does not contain the keywords matched below.
const DEVICE_CLASS_ICONS = new Map( [
	[ 'desktop', TbDeviceDesktop ],
	[ 'mobile', TbDeviceMobile ],
	[ 'tablet', TbDeviceTablet ],
	[ 'bot', TbRobot ],
] );

const getDeviceIcon = ( value ) => {
	const normalizedValue = normalizeValue( value );

	if ( DEVICE_CLASS_ICONS.has( normalizedValue ) ) {
		return DEVICE_CLASS_ICONS.get( normalizedValue );
	}

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

// Screen width buckets of formatScreenResolution() ("0-480px", "1441px+"): the icon of the device
// that usually has that width. Any other value keeps the generic resolution icon.
const getResolutionIcon = ( value ) => {
	const match = normalizeValue( value ).match( /^(\d+)(?:-\d+)?px\+?$/ );

	if ( ! match ) {
		return LuMaximize;
	}

	const lowerBound = Number.parseInt( match[ 1 ], 10 );

	if ( lowerBound < 481 ) {
		return TbDeviceMobile;
	}

	if ( lowerBound < 1025 ) {
		return TbDeviceTablet;
	}

	return TbDeviceDesktop;
};

const BrandIcon = ( { kind, value, className, size = 16 } ) => {
	let IconComponent = TbQuestionMark;

	if ( kind === 'device' ) {
		IconComponent = getDeviceIcon( value );
	} else if ( kind === 'resolution' ) {
		IconComponent = getResolutionIcon( value );
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
