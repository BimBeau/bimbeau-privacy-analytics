import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {
	Button,
	Flex,
	FlexItem,
	SelectControl,
	TextControl,
	Tooltip,
} from '@wordpress/components';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BpaCard from '../../components/BpaCard';
import ReferrerLabel from '../../components/ReferrerLabel';
import ReportExportAction from '../../components/ReportExportAction';
import { ADMIN_CONFIG } from '../../constants';
import BrandIcon from '../../components/icons/BrandIcon';
import {
	getCountryFlagClass,
	isUnknownCountryCode,
} from '../../lib/countryNames';
import { formatScreenResolution } from '../../lib/formatScreenResolution';
import {
	formatWpDateTime,
	normalizeUnixTimestampSeconds,
} from '../../lib/date';
import { getLocationLabel } from '../../lib/locationLabel';
import { formatDeviceClassLabel } from '../../lib/deviceClassLabel';
import { getChannelLabel } from '../../lib/channelLabels';

const formatVisitTime = (timestamp) => {
	const parsedTimestamp = Number(timestamp);

	if (!Number.isFinite(parsedTimestamp) || parsedTimestamp <= 0) {
		return __('Unknown', 'bimbeau-privacy-analytics');
	}

	const normalizedTimestamp =
		normalizeUnixTimestampSeconds(parsedTimestamp);
	if (normalizedTimestamp === null) {
		return __('Unknown', 'bimbeau-privacy-analytics');
	}

	return formatWpDateTime(
		normalizedTimestamp,
		__('Unknown', 'bimbeau-privacy-analytics')
	);
};

const formatTimeSpent = (timeSpentMs) => {
	const totalMilliseconds = Number(timeSpentMs);

	if (!Number.isFinite(totalMilliseconds) || totalMilliseconds <= 0) {
		return __('0s', 'bimbeau-privacy-analytics');
	}

	const totalSeconds = Math.floor(totalMilliseconds / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${String(minutes).padStart(
			2,
			'0'
		)}m ${String(seconds).padStart(2, '0')}s`;
	}

	if (minutes > 0) {
		return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
	}

	return `${seconds}s`;
};

const formatVisitorHashForTable = (hash) => {
	if (typeof hash !== 'string') {
		return '';
	}

	const normalizedHash = hash.trim();
	if (normalizedHash.length <= 10) {
		return normalizedHash;
	}

	return `${normalizedHash.slice(0, 10)}...`;
};

const VISITOR_TABLE_LABELS = {
	visitorId: __('Visitor ID hash', 'bimbeau-privacy-analytics'),
	country: __('Country', 'bimbeau-privacy-analytics'),
	city: __('City', 'bimbeau-privacy-analytics'),
	connectionTime: __('Connection time', 'bimbeau-privacy-analytics'),
	timeSpent: __('Active time', 'bimbeau-privacy-analytics'),
	pageViews: __('Page views', 'bimbeau-privacy-analytics'),
	referrer: __('Referrer', 'bimbeau-privacy-analytics'),
	channel: __('Entry channel', 'bimbeau-privacy-analytics'),
	operatingSystem: __('Operating system', 'bimbeau-privacy-analytics'),
	browser: __('Browser', 'bimbeau-privacy-analytics'),
	browserVersion: __('Browser version', 'bimbeau-privacy-analytics'),
	device: __('Device', 'bimbeau-privacy-analytics'),
	resolution: __('Resolution', 'bimbeau-privacy-analytics'),
};

const VISITOR_SORT_OPTIONS = [
	{
		label: __('Connection time', 'bimbeau-privacy-analytics'),
		value: 'first_view',
		order: 'desc',
	},
	{
		label: __('Country', 'bimbeau-privacy-analytics'),
		value: 'country',
		order: 'asc',
	},
	{
		label: __('City', 'bimbeau-privacy-analytics'),
		value: 'city',
		order: 'asc',
	},
	{
		label: __('Page views', 'bimbeau-privacy-analytics'),
		value: 'pages',
		order: 'desc',
	},
];

const NO_AVAILABLE_LABEL = __('No available', 'bimbeau-privacy-analytics');
const UNKNOWN_LABEL = __('Unknown', 'bimbeau-privacy-analytics');
const UNKNOWN_COUNTRY_LABEL = __('Unknown country', 'bimbeau-privacy-analytics');
const PRIVATE_LABEL = __('Private', 'bimbeau-privacy-analytics');
const MUTED_PLACEHOLDER_LABELS = new Set([
	NO_AVAILABLE_LABEL,
	UNKNOWN_LABEL,
	UNKNOWN_COUNTRY_LABEL,
]);

const renderMaybeUnavailableLabel = (label) =>
	MUTED_PLACEHOLDER_LABELS.has(label) ? (
		<span className="bbpa-label--unavailable">{label}</span>
	) : (
		label
	);

const isPrivateVisitorData = (item) => item?.has_enriched_data === false;

const renderPrivateDataLabel = () => (
	<span className="bbpa-private-label">{PRIVATE_LABEL}</span>
);

const getPrivateDataCellProps = (isPrivate) =>
	isPrivate
		? {
			className: 'bbpa-private-data',
		}
		: {};

const VisitorsTableCard = ({
	range,
	requestParams = {},
	title = __('Visitors', 'bimbeau-privacy-analytics'),
	emptyLabel = __('No visitor data available.', 'bimbeau-privacy-analytics'),
	loadingLabel = __('Loading visitors…', 'bimbeau-privacy-analytics'),
}) => {
	const [page, setPage] = useState(1);
	const [perPage, setPerPage] = useState(10);
	const [searchInput, setSearchInput] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [sortBy, setSortBy] = useState('first_view');

	useEffect(() => {
		setPage(1);
	}, [
		range.start,
		range.end,
		requestParams.page_path,
		requestParams.visitor_type,
	]);

	useEffect(() => {
		const debounceId = window.setTimeout(() => {
			setSearchTerm(searchInput.trim());
		}, 250);

		return () => window.clearTimeout(debounceId);
	}, [searchInput]);

	const selectedSortOption =
		VISITOR_SORT_OPTIONS.find((option) => option.value === sortBy) ||
		VISITOR_SORT_OPTIONS[0];

	const { data, isLoading, error } = useAdminEndpoint(
		'/visitors',
		{
			...range,
			...requestParams,
			page,
			per_page: perPage,
			orderby: selectedSortOption.value,
			order: selectedSortOption.order,
			search: searchTerm,
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
		}
	);

	const exportParams = {
		...range,
		...requestParams,
		orderby: selectedSortOption.value,
		order: selectedSortOption.order,
		search: searchTerm,
	};

	const items = data?.items || [];
	const pagination = data?.pagination || {};
	const totalPages = pagination.totalPages || 1;
	const totalItems = pagination.totalItems || items.length;

	useEffect(() => {
		if (!isLoading && !error && totalPages && page > totalPages) {
			setPage(totalPages);
		}
	}, [totalPages, page, isLoading, error]);

	const canPrevious = page > 1;
	const canNext = page < totalPages;

	const tableLabel = __('Table: Visitors', 'bimbeau-privacy-analytics');
	const headerActions = (
		<ReportExportAction
			report="visitors"
			params={exportParams}
			totalItems={totalItems}
		/>
	);

	return (
		<BpaCard title={title} headerActions={headerActions}>
			<div className="bbpa-table-controls">
				<div className="bbpa-table-controls__group">
					<SelectControl
						className="bbpa-table-controls__sort-control"
						label={__('Sort by', 'bimbeau-privacy-analytics')}
						value={sortBy}
						options={VISITOR_SORT_OPTIONS.map((option) => ({
							label: option.label,
							value: option.value,
						}))}
						onChange={(value) => {
							setSortBy(value);
							setPage(1);
						}}
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
					<SelectControl
						className="bbpa-table-controls__rows-control"
						label={__('Rows', 'bimbeau-privacy-analytics')}
						value={String(perPage)}
						options={[
							{ label: '5', value: '5' },
							{ label: '10', value: '10' },
							{ label: '20', value: '20' },
						]}
						onChange={(value) => {
							setPerPage(Number(value));
							setPage(1);
						}}
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
				</div>
				<div className="bbpa-table-controls__search">
					<TextControl
						label={__('Search', 'bimbeau-privacy-analytics')}
						value={searchInput}
						onChange={(value) => {
							setSearchInput(value);
							setPage(1);
						}}
						placeholder={__('Search…', 'bimbeau-privacy-analytics')}
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
				</div>
			</div>
			<DataState
				isLoading={isLoading}
				error={error}
				isEmpty={!isLoading && !error && items.length === 0}
				emptyLabel={emptyLabel}
				loadingLabel={loadingLabel}
			/>
			{!isLoading && !error && items.length > 0 && (
				<>
					<div className="bbpa-table-scroll">
						<table
							className="widefat striped bbpa-report-table bbpa-report-table--visitors"
							aria-label={tableLabel}
						>
							<thead>
								<tr>
									<th scope="col">
										{VISITOR_TABLE_LABELS.visitorId}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.country}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.city}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.connectionTime}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.timeSpent}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.pageViews}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.referrer}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.channel}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.operatingSystem}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.browser}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.browserVersion}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.device}
									</th>
									<th scope="col">
										{VISITOR_TABLE_LABELS.resolution}
									</th>
								</tr>
							</thead>
							<tbody>
								{items.map((item, index) => {
									const countryCode = (
										item.country_code || ''
									).toLowerCase();
									const flagClass =
										getCountryFlagClass(countryCode);
									const hasCountry =
										!isUnknownCountryCode(countryCode) &&
										flagClass;
									const isPrivateData =
										isPrivateVisitorData(item);

									return (
										<tr
											key={`${item.visitor_id || 'visitor'
												}-${index}`}
										>
											<td
												data-label={
													VISITOR_TABLE_LABELS.visitorId
												}
											>
												{item.visitor_id ? (
													<Tooltip
														text={item.visitor_id}
													>
														<code>
															{formatVisitorHashForTable(
																item.visitor_id
															)}
														</code>
													</Tooltip>
												) : (
													'—'
												)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.country
												}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData ? (
													renderPrivateDataLabel()
												) : (
													<span className="bbpa-country-label">
														{hasCountry ? (
															<span
																className={`bbpa-country-flag ${flagClass}`}
																role="img"
																aria-label={
																	item.country ||
																	UNKNOWN_COUNTRY_LABEL
																}
															/>
														) : (
															<span
																className="bbpa-country-flag bbpa-country-flag--unknown"
																role="img"
																aria-label={__(
																	'Unknown country',
																	'bimbeau-privacy-analytics'
																)}
															/>
														)}
														<span>
															{renderMaybeUnavailableLabel(
																item.country ||
																UNKNOWN_COUNTRY_LABEL
															)}
														</span>
													</span>
												)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.city
												}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData
													? renderPrivateDataLabel()
													: renderMaybeUnavailableLabel(
														getLocationLabel(
															item
														)
													)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.connectionTime
												}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData
													? renderPrivateDataLabel()
													: formatVisitTime(
														item.first_view_at
													)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.timeSpent
												}
											>
												{isPrivateData
													? renderPrivateDataLabel()
													: formatTimeSpent(
														item.active_time_ms
													)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.pageViews
												}
											>
												{item.page_views || 0}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.referrer
												}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData ? (
													renderPrivateDataLabel()
												) : (
													<ReferrerLabel
														domain={
															item.referrer_domain ||
															''
														}
														label={
															item.referrer_domain ||
															__(
																'Direct',
																'bimbeau-privacy-analytics'
															)
														}
													/>
												)}
											</td>
											<td
												data-label={VISITOR_TABLE_LABELS.channel}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData
													? renderPrivateDataLabel()
													: renderMaybeUnavailableLabel(
														item.source_category
															? getChannelLabel( item.source_category )
															: UNKNOWN_LABEL
													)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.operatingSystem
												}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData ? (
													renderPrivateDataLabel()
												) : (
													<span className="bbpa-brand-label">
														<BrandIcon
															kind="os"
															value={
																item.operating_system
															}
															className="bbpa-brand-icon"
														/>
														<span>
															{renderMaybeUnavailableLabel(
																item.operating_system ||
																UNKNOWN_LABEL
															)}
														</span>
													</span>
												)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.browser
												}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData ? (
													renderPrivateDataLabel()
												) : (
													<span className="bbpa-brand-label">
														<BrandIcon
															kind="browser"
															value={
																item.browser
															}
															className="bbpa-brand-icon"
														/>
														<span>
															{renderMaybeUnavailableLabel(
																item.browser ||
																UNKNOWN_LABEL
															)}
														</span>
													</span>
												)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.browserVersion
												}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData
													? renderPrivateDataLabel()
													: renderMaybeUnavailableLabel(
														item.browser_version ||
														UNKNOWN_LABEL
													)}
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.device
												}
											>
												<span className="bbpa-brand-label">
													<BrandIcon
														kind="device"
														value={
															item.device_class
														}
														className="bbpa-brand-icon"
													/>
													<span>
														{renderMaybeUnavailableLabel(
															formatDeviceClassLabel(
																item.device_class,
																UNKNOWN_LABEL
															)
														)}
													</span>
												</span>
											</td>
											<td
												data-label={
													VISITOR_TABLE_LABELS.resolution
												}
												{...getPrivateDataCellProps(
													isPrivateData
												)}
											>
												{isPrivateData
													? renderPrivateDataLabel()
													: renderMaybeUnavailableLabel(
														formatScreenResolution(
															item.screen_resolution
														) || UNKNOWN_LABEL
													)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					<Flex
						className="bbpa-table-pagination"
						justify="space-between"
						align="center"
					>
						<FlexItem>
							<div className="components-button-group">
								<Button
									variant="secondary"
									onClick={() =>
										setPage((prev) =>
											Math.max(prev - 1, 1)
										)
									}
									disabled={!canPrevious}
								>
									{__('Previous', 'bimbeau-privacy-analytics')}
								</Button>
								<Button
									variant="secondary"
									onClick={() =>
										setPage((prev) =>
											Math.min(prev + 1, totalPages)
										)
									}
									disabled={!canNext}
								>
									{__('Next', 'bimbeau-privacy-analytics')}
								</Button>
							</div>
						</FlexItem>
						<FlexItem className="bbpa-table-pagination__meta">{`${__(
							'Page',
							'bimbeau-privacy-analytics'
						)} ${page} ${__(
							'of',
							'bimbeau-privacy-analytics'
						)} ${totalPages}`}</FlexItem>
						<FlexItem className="bbpa-table-pagination__meta">{`${totalItems} ${__(
							'items',
							'bimbeau-privacy-analytics'
						)}`}</FlexItem>
					</Flex>
				</>
			)}
		</BpaCard>
	);
};

export default VisitorsTableCard;
