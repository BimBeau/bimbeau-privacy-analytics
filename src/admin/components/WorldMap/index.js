import { useMemo } from '@wordpress/element';
import { Choropleth } from '@nivo/geo';
import { __, sprintf } from '@wordpress/i18n';
import { scaleQuantize } from 'd3-scale';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import BpaCard from '../BpaCard';
import DataState from '../DataState';
import worldGeo from '../../data/world-countries.geojson';
import { buildHeatmapThemeColorRange, DEFAULT_HEATMAP_THEME_COLOR } from '../../lib/heatmapTheme';

const NO_DATA_COLOR = '#eeeeee';
const FALLBACK_WIDTH = 960;
const FALLBACK_HEIGHT = 420;
const CODE_ALIASES = { EL: 'GR', FX: 'FR', UK: 'GB' };
const ALPHA3_OVERRIDES = { FRA: 'FR', GBR: 'GB', GRC: 'GR', NOR: 'NO', USA: 'US' };

const normalizeCode = ( value ) => {
	const code = String( value || '' ).trim().toUpperCase();
	return CODE_ALIASES[ code ] || ALPHA3_OVERRIDES[ code ] || code;
};

const featureCode = ( feature ) => {
	const properties = feature?.properties || {};
	return normalizeCode(
		properties.ISO_A2 !== '-99' && properties.ISO_A2 ||
		properties.WB_A2 !== '-99' && properties.WB_A2 ||
		properties.ADM0_A3 || properties.ISO_A3 || feature?.id
	);
};

const featureName = ( feature ) =>
	feature?.properties?.NAME_EN || feature?.properties?.ADMIN || featureCode( feature );

export const normalizeCountryData = ( entries = [], features = worldGeo.features || [] ) => {
	const names = new Map( features.map( ( feature ) => [ featureName( feature ).toLowerCase(), featureCode( feature ) ] ) );
	const values = new Map();
	entries.forEach( ( entry ) => {
		const rawCode = entry?.code || entry?.country_code;
		const code = normalizeCode( rawCode ) || names.get( String( entry?.country || '' ).toLowerCase() );
		if ( ! code ) return;
		const value = Number( entry?.hits ?? entry?.visitors ?? entry?.visits ?? entry?.metric ) || 0;
		values.set( code, ( values.get( code ) || 0 ) + value );
	} );
	return features.map( ( feature ) => ( { id: featureCode( feature ), value: values.get( featureCode( feature ) ) || 0 } ) );
};

export const WorldChoropleth = ( { data, geoFeatures, maxDomainValue, tooltipRenderer, width = FALLBACK_WIDTH, height = FALLBACK_HEIGHT } ) => {
	const range = buildHeatmapThemeColorRange( DEFAULT_HEATMAP_THEME_COLOR );
	const colorScale = scaleQuantize().domain( [ 1, Math.max( 1, maxDomainValue ) ] ).range( range );
	return <Choropleth
		data={ data }
		features={ geoFeatures }
		match="id"
		value="value"
		colors={ ( feature ) => feature.value > 0 ? colorScale( feature.value ) : NO_DATA_COLOR }
		unknownColor={ NO_DATA_COLOR }
		domain={ [ 0, Math.max( 1, maxDomainValue ) ] }
		projectionType="mercator"
		projectionScale={ 130 }
		projectionTranslation={ [ 0.5, 0.5 ] }
		borderWidth={ 0.5 }
		borderColor="#ffffff"
		tooltip={ tooltipRenderer }
		width={ width }
		height={ height }
	/>;
};

const WorldMap = ( { range, endpoint = '/geo-countries', emptyLabel, emptyStateNoticeStatus, unknownCountryLabel = __( 'Unknown country', 'bimbeau-privacy-analytics' ) } ) => {
	const params = useMemo( () => ( { from: range?.from, to: range?.to } ), [ range?.from, range?.to ] );
	const { data, isLoading, error } = useAdminEndpoint( endpoint, params );
	const entries = Array.isArray( data?.countries ) ? data.countries : [];
	const chartData = useMemo( () => normalizeCountryData( entries ), [ entries ] );
	const maxDomainValue = Math.max( Number( data?.maxHits ) || 0, ...chartData.map( ( item ) => item.value ) );
	const hasData = chartData.some( ( item ) => item.value > 0 );

	return <BpaCard title={ __( 'World map', 'bimbeau-privacy-analytics' ) }>
		{ ( isLoading || error || ! hasData ) && <DataState isLoading={ isLoading } error={ error } emptyLabel={ emptyLabel } emptyStateNoticeStatus={ emptyStateNoticeStatus } /> }
		{ ! isLoading && ! error && <div className="bbpa-world-map__chart">
			<WorldChoropleth data={ chartData } geoFeatures={ worldGeo.features || [] } maxDomainValue={ maxDomainValue } tooltipRenderer={ ( { feature } ) => {
				const name = featureName( feature );
				const value = Number( feature?.value ) || 0;
				return <div className="bbpa-world-map__tooltip"><strong>{ name || unknownCountryLabel }</strong><span>{ sprintf( __( '%s visits', 'bimbeau-privacy-analytics' ), value ) }</span></div>;
			} } />
		</div> }
	</BpaCard>;
};

export default WorldMap;
