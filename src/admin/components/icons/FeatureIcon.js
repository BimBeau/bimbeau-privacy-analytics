import {
	LuActivity,
	LuLayers,
	LuScanSearch,
	LuChartColumn,
	LuFileJson,
	LuFileSpreadsheet,
	LuChevronDown,
	LuChevronLeft,
	LuChevronRight,
	LuChevronUp,
	LuCircleAlert,
	LuLink,
	LuSearch,
	LuEye,
	LuTimer,
	LuTrendingDown,
	LuTrendingUp,
} from 'react-icons/lu';

const LucideDownloadIcon = ( { className, size } ) => (
	<svg
		className={ className }
		width={ size }
		height={ size }
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<path d="M12 15V3" />
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<path d="m7 10 5 5 5-5" />
	</svg>
);

const FEATURE_ICON_MAP = {
	visits: LuChartColumn,
	pageViews: LuEye,
	uniqueReferrers: LuLink,
	notFoundHits: LuCircleAlert,
	searchHits: LuSearch,
	avgTimePerVisit: LuTimer,
	ascending: LuChevronUp,
	descending: LuChevronDown,
	activity: LuActivity,
	download: LucideDownloadIcon,
	fileBraces: LuFileJson,
	fileSpreadsheet: LuFileSpreadsheet,
	layers: LuLayers,
	scanSearch: LuScanSearch,
	chevronDown: LuChevronDown,
	chevronLeft: LuChevronLeft,
	chevronRight: LuChevronRight,
	trendingUp: LuTrendingUp,
	trendingDown: LuTrendingDown,
};

const FeatureIcon = ( { name, className, size = 18 } ) => {
	const IconComponent = FEATURE_ICON_MAP[ name ] || FEATURE_ICON_MAP.activity;

	return (
		<IconComponent
			className={ className }
			size={ size }
			aria-hidden="true"
		/>
	);
};

export default FeatureIcon;
