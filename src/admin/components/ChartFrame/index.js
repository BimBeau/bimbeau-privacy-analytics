import { useEffect, useRef, useState } from '@wordpress/element';

const useSizedContainer = () => {
    const ref = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const hasSize = size.width > 0 && size.height > 0;

    useEffect(() => {
        const node = ref.current;
        if (!node) {
            return undefined;
        }

        const updateSize = () => {
            const rect = node.getBoundingClientRect();
            const nextSize = {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            };
            setSize((prev) =>
                prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize
            );
        };

        updateSize();

        let observer;
        if (window.ResizeObserver) {
            observer = new ResizeObserver(() => updateSize());
            observer.observe(node);
        } else {
            window.addEventListener('resize', updateSize);
        }

        return () => {
            if (observer) {
                observer.disconnect();
            } else {
                window.removeEventListener('resize', updateSize);
            }
        };
    }, []);

    return { ref, size, hasSize };
};

const ChartFrame = ({ height, ariaLabel, children, onResize }) => {
    const { ref, size, hasSize } = useSizedContainer();

    useEffect(() => {
        if (!hasSize || !onResize) {
            return;
        }

        onResize(size);
    }, [hasSize, onResize, size]);

    return (
        <div ref={ref} className="bbpa-chart-frame" data-height={height} role="img" aria-label={ariaLabel}>
            {hasSize ? children : null}
        </div>
    );
};

export default ChartFrame;
