import { useCallback, useState } from "@wordpress/element";

import {
  getStoredVisitorsHidePrivate,
  storeVisitorsHidePrivate,
} from "../lib/storage";

/**
 * "Hide private visitors" preference of the Visitors report, remembered per user in localStorage.
 *
 * Off by default: every visitor row is listed until the user turns the toggle on.
 *
 * @return {[boolean, Function]} Current value and setter (the setter stores the new value).
 */
const useVisitorsHidePrivatePreference = () => {
  const [hidePrivate, setHidePrivateState] = useState(
    () => getStoredVisitorsHidePrivate() === true,
  );

  const setHidePrivate = useCallback((nextValue) => {
    const normalizedValue = Boolean(nextValue);
    setHidePrivateState(normalizedValue);
    storeVisitorsHidePrivate(normalizedValue);
  }, []);

  return [hidePrivate, setHidePrivate];
};

export default useVisitorsHidePrivatePreference;
