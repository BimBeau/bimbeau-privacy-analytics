import { normalizeAdminReportPayload } from './normalizeReportPayload';

describe( 'normalizeAdminReportPayload', () => {
	it( 'uses visitor totals for the country map aliases', () => {
		const payload = normalizeAdminReportPayload( '/geo-countries', {
			maxHits: 801,
			maxVisitors: 209,
			totalHits: 1240,
			totalVisitors: 235,
		} );

		expect( payload.maxHits ).toBe( 209 );
		expect( payload.totalHits ).toBe( 235 );
	} );

	it( 'supports endpoint paths with query strings and trailing slashes', () => {
		const payload = normalizeAdminReportPayload(
			'/geo-countries/?start=2026-07-07',
			{
				maxHits: 500,
				maxVisitors: 12,
				totalHits: 900,
				totalVisitors: 16,
			}
		);

		expect( payload.maxHits ).toBe( 12 );
		expect( payload.totalHits ).toBe( 16 );
	} );

	it( 'preserves legacy country responses without visitor-specific totals', () => {
		const payload = {
			maxHits: 120,
			totalHits: 250,
		};

		expect( normalizeAdminReportPayload( '/geo-countries', payload ) ).toBe(
			payload
		);
	} );

	it( 'does not alter other report endpoints', () => {
		const payload = {
			maxHits: 801,
			maxVisitors: 209,
			totalHits: 1240,
			totalVisitors: 235,
		};

		expect( normalizeAdminReportPayload( '/geo-cities', payload ) ).toBe(
			payload
		);
	} );
} );
