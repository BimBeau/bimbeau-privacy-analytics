import { useEffect, useMemo, useState } from "@wordpress/element";

import { DEFAULT_RANGE_PRESET } from "../constants";
import {
  getRangeSelectionFromUrl,
  getStoredRangeSelection,
  isValidRangeSelection,
  storeRangeSelection,
} from "../lib/storage";

const useSharedRangeSelection = () => {
  // The URL does not change while the page is open: parse it once, so the
  // effect below does not run (and write to localStorage) on every render.
  const urlSelection = useMemo(() => getRangeSelectionFromUrl(), []);
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
