import { useEffect, useState } from "@wordpress/element";

import { DEFAULT_PAGE_LABEL_DISPLAY } from "../constants";
import {
  getStoredPageLabelDisplay,
  isValidPageLabelDisplay,
  storePageLabelDisplay,
} from "../lib/storage";

const useSharedPageLabelDisplay = () => {
  const [pageLabelDisplay, setPageLabelDisplay] = useState(
    () => getStoredPageLabelDisplay() || DEFAULT_PAGE_LABEL_DISPLAY,
  );

  useEffect(() => {
    if (isValidPageLabelDisplay(pageLabelDisplay)) {
      storePageLabelDisplay(pageLabelDisplay);
    }
  }, [pageLabelDisplay]);

  return [pageLabelDisplay, setPageLabelDisplay];
};

export default useSharedPageLabelDisplay;
