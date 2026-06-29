import { __ } from '@wordpress/i18n';

export const CHANNEL_LABELS = {
	direct: __( 'Direct', 'bimbeau-privacy-analytics' ),
	'organic-search': __( 'Organic Search', 'bimbeau-privacy-analytics' ),
	'paid-search': __( 'Paid Search', 'bimbeau-privacy-analytics' ),
	referrals: __( 'Referrals', 'bimbeau-privacy-analytics' ),
	'paid-social': __( 'Paid Social', 'bimbeau-privacy-analytics' ),
	'organic-social': __( 'Organic Social', 'bimbeau-privacy-analytics' ),
	email: __( 'Email', 'bimbeau-privacy-analytics' ),
	'other-campaigns': __( 'Other Campaigns', 'bimbeau-privacy-analytics' ),
	'ai-assistants': __( 'AI Assistants', 'bimbeau-privacy-analytics' ),
	other: __( 'Other', 'bimbeau-privacy-analytics' ),
};

const CHANNEL_LABEL_TO_KEY = {
	Direct: 'direct',
	'Organic Search': 'organic-search',
	'Paid Search': 'paid-search',
	Referrals: 'referrals',
	Referral: 'referrals',
	Referrer: 'referrals',
	'Paid Social': 'paid-social',
	'Organic Social': 'organic-social',
	Email: 'email',
	'Other Campaigns': 'other-campaigns',
	'AI Assistants': 'ai-assistants',
	Other: 'other',
};

export const getChannelLabel = ( value ) => {
	const normalizedValue = typeof value === 'string' ? value.trim() : '';

	if ( ! normalizedValue ) {
		return CHANNEL_LABELS.other;
	}

	const key = CHANNEL_LABELS[ normalizedValue ]
		? normalizedValue
		: CHANNEL_LABEL_TO_KEY[ normalizedValue ];

	return key ? CHANNEL_LABELS[ key ] : normalizedValue;
};
