import { useMemo } from '@wordpress/element';
import { Choropleth } from '@nivo/geo';
import { __, sprintf } from '@wordpress/i18n';
import { scaleQuantize } from 'd3-scale';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import { ADMIN_CONFIG } from '../../constants';
import BpaCard from '../BpaCard';
import DataState from '../DataState';
import worldGeo from '../../data/world-countries.geojson';
import {
	buildHeatmapThemeColorRange,
	DEFAULT_HEATMAP_THEME_COLOR,
} from '../../lib/heatmapTheme';

const NO_DATA_COLOR = '#eeeeee';
const FALLBACK_WIDTH = 960;
const FALLBACK_HEIGHT = 420;
const CODE_ALIASES = { EL: 'GR', FX: 'FR', UK: 'GB' };
const ALPHA3_OVERRIDES = {
	FRA: 'FR',
	GBR: 'GB',
	GRC: 'GR',
	NOR: 'NO',
	USA: 'US',
};
const FALLBACK_COLOR_RANGE = [
	'rgb(239, 241, 254)',
	'rgb(219, 226, 251)',
	'rgb(191, 201, 247)',
	'rgb(156, 171, 244)',
	'rgb(112, 135, 239)',
	DEFAULT_HEATMAP_THEME_COLOR,
];

export const normalizeMapValue = ( value ) => {
	if ( value === null || value === undefined || value === '' ) {
		return 0;
	}
	const numericValue = Number( value );
	return Number.isFinite( numericValue ) && numericValue > 0
		? numericValue
		: 0;
};

export const normalizeColorRange = ( range ) => {
	if ( ! Array.isArray( range ) ) {
		return FALLBACK_COLOR_RANGE;
	}
	const colors = range.filter(
		( color ) => typeof color === 'string' && color.trim()
	);
	return colors.length >= 2 ? colors : FALLBACK_COLOR_RANGE;
};

const normalizeCode = ( value ) => {
	const code = String( value || '' )
		.trim()
		.toUpperCase();
	return CODE_ALIASES[ code ] || ALPHA3_OVERRIDES[ code ] || code;
};

const featureCode = ( feature ) => {
	const properties = feature?.properties || {};
	return normalizeCode(
		( properties.ISO_A2 !== '-99' && properties.ISO_A2 ) ||
			( properties.WB_A2 !== '-99' && properties.WB_A2 ) ||
			properties.ADM0_A3 ||
			properties.ISO_A3 ||
			feature?.id
	);
};

const featureName = ( feature ) =>
	feature?.properties?.NAME_EN ||
	feature?.properties?.ADMIN ||
	featureCode( feature );

export const normalizeCountryData = (
	entries = [],
	features = worldGeo.features || []
) => {
	const safeEntries = Array.isArray( entries ) ? entries : [];
	const safeFeatures = Array.isArray( features ) ? features : [];
	const names = new Map(
		safeFeatures.map( ( feature ) => [
			featureName( feature ).toLowerCase(),
			featureCode( feature ),
		] )
	);
	const values = new Map();
	safeEntries.forEach( ( entry ) => {
		const rawCode = entry?.code || entry?.country_code;
		const code =
			normalizeCode( rawCode ) ||
			names.get( String( entry?.country || '' ).toLowerCase() );
		if ( ! code ) {
			return;
		}
		const value = normalizeMapValue(
			entry?.hits ?? entry?.visitors ?? entry?.visits ?? entry?.metric
		);
		if ( value === 0 ) {
			return;
		}
		values.set( code, ( values.get( code ) || 0 ) + value );
	} );
	return safeFeatures
		.map( ( feature ) => ( {
			id: featureCode( feature ),
			value: values.get( featureCode( feature ) ) || 0,
		} ) )
		.filter( ( item ) => item.id && item.value > 0 );
};

export const WorldChoropleth = ( {
	data = [],
	geoFeatures = [],
	maxDomainValue,
	tooltipRenderer,
	width = FALLBACK_WIDTH,
	height = FALLBACK_HEIGHT,
	colorRange,
} ) => {
	const range = normalizeColorRange(
		colorRange || buildHeatmapThemeColorRange( DEFAULT_HEATMAP_THEME_COLOR )
	);
	const sanitizedData = Array.isArray( data )
		? data
				.map( ( item ) => ( {
					...item,
					value: normalizeMapValue( item?.value ),
				} ) )
				.filter( ( item ) => item.id && item.value > 0 )
		: [];
	const sanitizedMaxDomainValue = Math.max(
		normalizeMapValue( maxDomainValue ),
		...sanitizedData.map( ( item ) => item.value ),
		0
	);
	const domain = [ 0, Math.max( 1, sanitizedMaxDomainValue ) ];
	const colorScale = scaleQuantize().domain( domain ).range( range );
	return (
		<Choropleth
			data={ sanitizedData }
			features={ Array.isArray( geoFeatures ) ? geoFeatures : [] }
			match="id"
			value="value"
			colors={ colorScale }
			unknownColor={ NO_DATA_COLOR }
			domain={ domain }
			projectionType="mercator"
			projectionScale={ 130 }
			projectionTranslation={ [ 0.5, 0.5 ] }
			borderWidth={ 0.5 }
			borderColor="#ffffff"
			tooltip={ tooltipRenderer }
			width={ width }
			height={ height }
		/>
	);
};

const WorldMap = ( {
	range,
	endpoint = '/geo-countries',
	emptyLabel,
	emptyStateNoticeStatus,
	unknownCountryLabel = __( 'Unknown country', 'bimbeau-privacy-analytics' ),
} ) => {
	const params = useMemo(
		() => ( { from: range?.from, to: range?.to } ),
		[ range?.from, range?.to ]
	);
	const { data, isLoading, error } = useAdminEndpoint( endpoint, params, {
		namespace: ADMIN_CONFIG?.settings?.restNamespace,
	} );
	const chartData = useMemo(
		() =>
			normalizeCountryData(
				Array.isArray( data?.countries ) ? data.countries : []
			),
		[ data?.countries ]
	);
	const maxDomainValue = Math.max(
		normalizeMapValue( data?.maxHits ),
		...chartData.map( ( item ) => item.value ),
		0
	);
	const hasData = chartData.some( ( item ) => item.value > 0 );

	return (
		<BpaCard title={ __( 'World map', 'bimbeau-privacy-analytics' ) }>
			{ ( isLoading || error || ! hasData ) && (
				<DataState
					isLoading={ isLoading }
					error={ error }
					emptyLabel={ emptyLabel }
					emptyStateNoticeStatus={ emptyStateNoticeStatus }
				/>
			) }
			{ ! isLoading && ! error && (
				<div className="bbpa-world-map__chart">
					<WorldChoropleth
						data={ chartData }
						geoFeatures={ worldGeo.features || [] }
						maxDomainValue={ maxDomainValue }
						tooltipRenderer={ ( { feature } ) => {
							const name = featureName( feature );
							const value = Number( feature?.value ) || 0;
							return (
								<div className="bbpa-world-map__tooltip">
									<strong>
										{ name || unknownCountryLabel }
									</strong>
									<span>
										{ sprintf(
											/* translators: %s: visit count. */ __(
												'%s visits',
												'bimbeau-privacy-analytics'
											),
											value
										) }
									</span>
								</div>
							);
						} }
					/>
				</div>
			) }
		</BpaCard>
	);
};

export default WorldMap;
