export const DEFAULT_AUDIENCE_BREAKDOWN_LIMIT = 4;

export const takeTopBreakdownItems = (
	items = [],
	limit = DEFAULT_AUDIENCE_BREAKDOWN_LIMIT
) => items.slice( 0, limit );

export const buildAudienceBreakdownSections = (
	stats,
	limit = DEFAULT_AUDIENCE_BREAKDOWN_LIMIT
) => ( {
	browsers: takeTopBreakdownItems( stats?.browsers ?? [], limit ),
	operatingSystems: takeTopBreakdownItems(
		stats?.operatingSystems ?? [],
		limit
	),
	devices: takeTopBreakdownItems( stats?.devices ?? [], limit ),
	resolutions: takeTopBreakdownItems( stats?.resolutions ?? [], limit ),
} );
