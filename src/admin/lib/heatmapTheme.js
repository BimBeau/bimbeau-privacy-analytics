export const DEFAULT_HEATMAP_THEME_COLOR = "rgb(56, 88, 233)";
export const HEATMAP_THEME_COLOR_PROPERTY = "--color-3";

const parseRgbChannel = (value) => {
  const numericValue = Number.parseFloat(value);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  return Math.round(Math.min(255, Math.max(0, numericValue)));
};

const parseColorChannels = (color) => {
  if (typeof color !== "string") {
    return null;
  }

  const normalizedColor = color.trim().toLowerCase();
  const rgbMatch = normalizedColor.match(
    /^rgba?\(\s*([0-9.]+)(?:\s*,\s*|\s+)([0-9.]+)(?:\s*,\s*|\s+)([0-9.]+)/,
  );

  if (rgbMatch) {
    const channels = rgbMatch.slice(1, 4).map(parseRgbChannel);

    if (channels.some((channel) => channel === null)) {
      return null;
    }

    return channels;
  }

  const hexMatch = normalizedColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (!hexMatch) {
    return null;
  }

  const [hex] = hexMatch.slice(1);
  const fullHex =
    hex.length === 3
      ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
      : hex;

  return [
    Number.parseInt(fullHex.slice(0, 2), 16),
    Number.parseInt(fullHex.slice(2, 4), 16),
    Number.parseInt(fullHex.slice(4, 6), 16),
  ];
};

const formatRgbColor = (channels) =>
  `rgb(${channels.map((channel) => Math.round(channel)).join(", ")})`;

const mixColorWithWhite = (channels, colorWeight) => {
  const whiteWeight = 1 - colorWeight;

  return channels.map((channel) => channel * colorWeight + 255 * whiteWeight);
};

export const buildHeatmapThemeColorRange = (baseColor) => {
  const channels =
    parseColorChannels(baseColor) ||
    parseColorChannels(DEFAULT_HEATMAP_THEME_COLOR);
  const colorWeights = [0.08, 0.18, 0.32, 0.5, 0.72, 1];

  return colorWeights.map((colorWeight) =>
    formatRgbColor(mixColorWithWhite(channels, colorWeight)),
  );
};

const interpolateColorChannels = ( startChannels, endChannels, progress ) =>
	startChannels.map(
		( startChannel, index ) =>
			startChannel + ( endChannels[ index ] - startChannel ) * progress
	);

export const buildHeatmapThemeColorInterpolator = ( baseColor ) => {
	const colorRange = buildHeatmapThemeColorRange( baseColor );
	const colorChannels = colorRange.map( parseColorChannels );
	const maxIndex = colorChannels.length - 1;

	return ( value ) => {
		const normalizedValue = Math.min(
			1,
			Math.max( 0, Number( value ) || 0 )
		);
		const scaledValue = normalizedValue * maxIndex;
		const startIndex = Math.floor( scaledValue );
		const endIndex = Math.min( maxIndex, startIndex + 1 );
		const progress = scaledValue - startIndex;

		return formatRgbColor(
			interpolateColorChannels(
				colorChannels[ startIndex ],
				colorChannels[ endIndex ],
				progress
			)
		);
	};
};

const toRelativeLuminance = ( channel ) => {
	const normalized = channel / 255;

	if ( normalized <= 0.03928 ) {
		return normalized / 12.92;
	}

	return ( ( normalized + 0.055 ) / 1.055 ) ** 2.4;
};

export const getHeatmapLabelTextColor = ( cellColor ) => {
	const channels = parseColorChannels( cellColor );

	if ( ! channels ) {
		return 'rgba(15, 23, 42, 0.86)';
	}

	const [ red, green, blue ] = channels;
	const luminance =
		0.2126 * toRelativeLuminance( red ) +
		0.7152 * toRelativeLuminance( green ) +
		0.0722 * toRelativeLuminance( blue );

	return luminance < 0.44
		? 'rgba(248, 250, 252, 0.96)'
		: 'rgba(15, 23, 42, 0.86)';
};
