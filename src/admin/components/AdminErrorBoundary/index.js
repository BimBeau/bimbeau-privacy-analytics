import { Component } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import Notice from '../BrandNotice';

class AdminErrorBoundary extends Component {
    state = {
        error: null,
        componentStack: '',
    };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        const { onError } = this.props;
        this.setState({ componentStack: info?.componentStack || '' });
        if (onError) {
            onError(error, info);
        }
    }

    render() {
        const { error, componentStack } = this.state;
        const {
            fatal,
            checkedHandles = [],
            checkedGlobals = [],
            children,
        } = this.props;
        const details = fatal || error;

        if (details) {
            const handlesList = (details?.checkedHandles || checkedHandles).filter(Boolean);
            const globalsList = (details?.checkedGlobals || checkedGlobals).filter(Boolean);
            const detailMessage =
                details?.reason || details?.message || (typeof details === 'string' ? details : '');
            const adminConfig =
                typeof window !== 'undefined' ? window.BBPAAdmin || null : null;
            const queryParams =
                typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const currentPanel =
                details?.currentPanel || adminConfig?.currentPanel || queryParams?.get('panel');
            const currentPage =
                details?.currentPage || adminConfig?.currentPage || queryParams?.get('page');
            const panelPageLabel = [currentPanel, currentPage]
                .filter(Boolean)
                .join(' / ');
            const combinedDetails = [
                detailMessage,
                details?.stack,
                componentStack,
            ]
                .filter(Boolean)
                .join('\n');
            const componentFromStack =
                componentStack.match(/in\s+([A-Z][A-Za-z0-9_]+)/)?.[1] || '';
            const componentFromMessage =
                combinedDetails.match(/([A-Z][A-Za-z0-9_]+)\s+is\s+undefined/)?.[1] || '';
            const undefinedComponent = componentFromMessage || componentFromStack;

            return (
                <Notice status="error" isDismissible={false}>
                    <p>
                        {__('BimBeau Privacy Analytics cannot load the admin interface.', 'bimbeau-privacy-analytics')}
                    </p>
                    {detailMessage && <p>{detailMessage}</p>}
                    {panelPageLabel && (
                        <p>
                            {sprintf(
                                /* translators: %s: current admin panel and page label. */
                                __('Panel/page: %s', 'bimbeau-privacy-analytics'),
                                panelPageLabel
                            )}
                        </p>
                    )}
                    {undefinedComponent && (
                        <p>
                            {sprintf(
                                /* translators: %s: React component name detected as undefined. */
                                __('Component undefined: %s', 'bimbeau-privacy-analytics'),
                                undefinedComponent
                            )}
                        </p>
                    )}
                    {undefinedComponent && (
                        <p>
                            {sprintf(
                                __(
                                    /* translators: %s: React component name detected as undefined. */
                                    'Possible Gutenberg/@wordpress/components mismatch: %s undefined',
                                    'bimbeau-privacy-analytics'
                                ),
                                undefinedComponent
                            )}
                        </p>
                    )}
                    {handlesList.length > 0 && (
                        <p>
                            {sprintf(
                                /* translators: %s: comma-separated WordPress script handles checked while debugging. */
                                __('Script handles checked: %s', 'bimbeau-privacy-analytics'),
                                handlesList.join(', ')
                            )}
                        </p>
                    )}
                    {globalsList.length > 0 && (
                        <p>
                            {sprintf(
                                /* translators: %s: comma-separated JavaScript global namespaces checked while debugging. */
                                __('Global namespaces checked: %s', 'bimbeau-privacy-analytics'),
                                globalsList.join(', ')
                            )}
                        </p>
                    )}
                </Notice>
            );
        }

        return children;
    }
}

export default AdminErrorBoundary;
