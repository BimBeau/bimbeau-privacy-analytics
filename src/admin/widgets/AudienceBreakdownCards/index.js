import { useMemo } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BrandIcon from '../../components/icons/BrandIcon';
import BpaCard from '../../components/BpaCard';
import { ADMIN_CONFIG } from '../../constants';
import { buildAudienceBreakdownSections } from '../../lib/audienceBreakdowns';
import { buildDeviceDetailsBreakdowns } from '../../lib/deviceDetails';
import './styles.css';

const formatBreakdownLabel = ( label, fallbackLabel ) => {
	if ( typeof label !== 'string' || label.trim() === '' ) {
		return fallbackLabel;
	}

	const normalizedLabel = label.trim();
	const lowercaseLabel = normalizedLabel.toLowerCase();

	if ( lowercaseLabel === 'desktop' ) {
		return __( 'Desktop', 'bimbeau-privacy-analytics' );
	}

	if ( lowercaseLabel === 'mobile' ) {
		return __( 'Smartphone', 'bimbeau-privacy-analytics' );
	}

	if ( lowercaseLabel === 'tablet' ) {
		return __( 'Tablet', 'bimbeau-privacy-analytics' );
	}

	return normalizedLabel;
};

const BreakdownCard = ( { kind, title, items, emptyLabel, totalHits } ) => {
	const breakdownItems = items.map( ( item ) => ( {
		rawLabel: item.label,
		label: formatBreakdownLabel(
			item.label,
			__( 'Unknown', 'bimbeau-privacy-analytics' )
		),
		hits: item.hits,
		share: item.share,
	} ) );

	if ( breakdownItems.length === 0 ) {
		return (
			<BpaCard className="bbpa-audience-breakdown-card" title={ title }>
				<DataState
					isLoading={ false }
					error={ null }
					isEmpty
					emptyLabel={ emptyLabel }
				/>
			</BpaCard>
		);
	}

	return (
		<BpaCard className="bbpa-audience-breakdown-card" title={ title }>
			<ul className="bbpa-audience-breakdown-card__list">
				{ breakdownItems.map( ( item ) => (
					<li
						key={ item.label }
						className="bbpa-audience-breakdown-card__list-item"
					>
						<span className="bbpa-audience-breakdown-card__label">
							<BrandIcon
								kind={ kind }
								value={ item.rawLabel }
								className="bbpa-audience-breakdown-card__icon"
								size={ 20 }
							/>
							<span>{ item.label }</span>
						</span>
						<span className="bbpa-audience-breakdown-card__metric">
							{ sprintf(
								/* translators: %s: page views count. */
								_n(
									'%s page view',
									'%s page views',
									item.hits,
									'bimbeau-privacy-analytics'
								),
								item.hits
							) }
						</span>
						<div
							className="bbpa-audience-breakdown-card__share"
							aria-label={ sprintf(
								/* translators: %s: percentage value. */
								__( '%1$s%% share', 'bimbeau-privacy-analytics' ),
								item.share
							) }
						>
							<span
								className="bbpa-audience-breakdown-card__share-bar"
								style={ { width: `${ item.share }%` } }
								aria-hidden="true"
							/>
							<strong className="bbpa-audience-breakdown-card__share-value">
								{ `${ item.share }%` }
							</strong>
						</div>
					</li>
				) ) }
			</ul>
			<p className="bbpa-audience-breakdown-card__summary">
				{ sprintf(
					/* translators: %s: total page views in the selected range. */
					__(
						'Based on %s tracked page views in the selected range.',
						'bimbeau-privacy-analytics'
					),
					totalHits
				) }
			</p>
		</BpaCard>
	);
};

const AudienceBreakdownCards = ( {
	range,
	requestParams = {},
	includeResolutions = false,
} ) => {
	const { data, isLoading, error } = useAdminEndpoint(
		'/visitors',
		{
			...range,
			...requestParams,
			page: 1,
			per_page: 500,
			orderby: 'pages',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
		}
	);
	const stats = useMemo(
		() => buildDeviceDetailsBreakdowns( data?.items || [] ),
		[ data ]
	);
	const sections = useMemo(
		() => buildAudienceBreakdownSections( stats ),
		[ stats ]
	);
	const hasContent =
		sections.browsers.length > 0 ||
		sections.operatingSystems.length > 0 ||
		sections.devices.length > 0 ||
		( includeResolutions && sections.resolutions.length > 0 );

	return (
		<div className="bbpa-audience-breakdown-grid">
			<DataState
				isLoading={ isLoading }
				error={ error }
				isEmpty={ ! isLoading && ! error && ! hasContent }
				emptyLabel={ __(
					'No audience breakdowns available.',
					'bimbeau-privacy-analytics'
				) }
				loadingLabel={ __(
					'Loading audience breakdowns…',
					'bimbeau-privacy-analytics'
				) }
			/>
			{ ! isLoading && ! error && hasContent ? (
				<>
					<BreakdownCard
						kind="browser"
						title={ __( 'Browser usage', 'bimbeau-privacy-analytics' ) }
						items={ sections.browsers }
						totalHits={ stats.totalHits }
						emptyLabel={ __(
							'No browser usage available.',
							'bimbeau-privacy-analytics'
						) }
					/>
					<BreakdownCard
						kind="os"
						title={ __(
							'Most used operating systems',
							'bimbeau-privacy-analytics'
						) }
						items={ sections.operatingSystems }
						totalHits={ stats.totalHits }
						emptyLabel={ __(
							'No operating system usage available.',
							'bimbeau-privacy-analytics'
						) }
					/>
					<BreakdownCard
						kind="device"
						title={ __( 'Device usage breakdown', 'bimbeau-privacy-analytics' ) }
						items={ sections.devices }
						totalHits={ stats.totalHits }
						emptyLabel={ __(
							'No device usage available.',
							'bimbeau-privacy-analytics'
						) }
					/>
					{ includeResolutions ? (
						<BreakdownCard
							kind="resolution"
							title={ __( 'Resolution', 'bimbeau-privacy-analytics' ) }
							items={ sections.resolutions }
							totalHits={ stats.totalHits }
							emptyLabel={ __(
								'No resolution data available.',
								'bimbeau-privacy-analytics'
							) }
						/>
					) : null }
				</>
			) : null }
		</div>
	);
};

export default AudienceBreakdownCards;
