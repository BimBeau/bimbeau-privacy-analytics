import { useEffect, useState } from "@wordpress/element";

import { DEFAULT_RANGE_PRESET } from "../constants";
import {
  getRangeSelectionFromUrl,
  getStoredRangeSelection,
  isValidRangeSelection,
  storeRangeSelection,
} from "../lib/storage";

const useSharedRangeSelection = () => {
  const urlSelection = getRangeSelectionFromUrl();
  const [rangeSelection, setRangeSelectionState] = useState(() => {
    if (urlSelection) {
      return urlSelection;
    }

    return (
      getStoredRangeSelection() || {
        type: "preset",
        preset: DEFAULT_RANGE_PRESET,
      }
    );
  });
  const [hasUserOverride, setHasUserOverride] = useState(false);

  const setRangeSelection = (selection) => {
    setRangeSelectionState(selection);
    setHasUserOverride(true);
  };

  useEffect(() => {
    if (urlSelection && !hasUserOverride) {
      return;
    }

    if (isValidRangeSelection(rangeSelection)) {
      storeRangeSelection(rangeSelection);
    }
  }, [rangeSelection, urlSelection, hasUserOverride]);

  return [rangeSelection, setRangeSelection];
};

export default useSharedRangeSelection;
