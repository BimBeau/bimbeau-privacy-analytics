export const parseTimeBucketDate = ( value ) => {
	if ( typeof value !== 'string' || ! value ) {
		return null;
	}

	const normalized = value.trim().replace( ' ', 'T' );
	const hourlyMatch = normalized.match(
		/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2})(?::(\d{2}))?)?$/
	);

	if ( hourlyMatch ) {
		const [ , year, month, day, hour, minute = '00', second = '00' ] =
			hourlyMatch;
		return new Date(
			Date.UTC(
				Number( year ),
				Number( month ) - 1,
				Number( day ),
				Number( hour ),
				Number( minute ),
				Number( second )
			)
		);
	}

	const dailyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

	if ( dailyMatch ) {
		const [ , year, month, day ] = dailyMatch;
		return new Date(
			Date.UTC( Number( year ), Number( month ) - 1, Number( day ) )
		);
	}

	const date = new Date( normalized );
	return Number.isNaN( date.getTime() ) ? null : date;
};
