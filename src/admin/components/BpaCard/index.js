import { createElement, forwardRef } from '@wordpress/element';
import { Card, CardBody, CardHeader } from '@wordpress/components';

const Wrapper = ( { className, children } ) => (
	<div className={ className }>{ children }</div>
);

const BpaCard = forwardRef(
	( { title, headerActions = null, children, ...props }, ref ) => {
		const CardComponent = Card || Wrapper;
		const CardHeaderComponent = CardHeader || Wrapper;
		const CardBodyComponent = CardBody || Wrapper;

		const fallbackProps = {
			className: [ 'bbpa-card', props.className ]
				.filter( Boolean )
				.join( ' ' ),
		};

		const cardProps = Card ? props : fallbackProps;
		const resolvedCardProps = {
			...cardProps,
			ref,
		};

		return createElement(
			CardComponent,
			resolvedCardProps,
			title
				? createElement(
						CardHeaderComponent,
						CardHeader
							? undefined
							: { className: 'bbpa-card__header' },
						createElement(
							'div',
							{ className: 'bbpa-card__header-content' },
							createElement(
								'strong',
								{ className: 'bbpa-card__title' },
								title
							),
							headerActions
								? createElement(
										'div',
										{
											className:
												'bbpa-card__header-actions',
										},
										headerActions
								  )
								: null
						)
				  )
				: null,
			createElement(
				CardBodyComponent,
				CardBody ? undefined : { className: 'bbpa-card__body' },
				children
			)
		);
	}
);

export default BpaCard;
