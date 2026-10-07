import { useCallback, useSyncExternalStore } from "@wordpress/element";

import { DEFAULT_LIST_DENSITY } from "../constants";
import {
  getStoredListDensity,
  normalizeListDensity,
  storeListDensity,
} from "../lib/storage";

/*
 * One density for every DataViews list of the admin: a change in one list's View options applies to
 * all mounted lists at once and is saved for the current user.
 */
let currentDensity = null;
const listeners = new Set();

const getDensity = () => {
  if (currentDensity === null) {
    currentDensity = getStoredListDensity() || DEFAULT_LIST_DENSITY;
  }

  return currentDensity;
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setSharedListDensity = (density) => {
  const nextDensity = normalizeListDensity(density);
  if (!nextDensity || nextDensity === getDensity()) {
    return;
  }

  currentDensity = nextDensity;
  storeListDensity(nextDensity);
  listeners.forEach((listener) => listener());
};

// Test helper: forget the in-memory value so the next read comes from storage again.
export const resetSharedListDensity = () => {
  currentDensity = null;
};

const useSharedListDensity = () => {
  const density = useSyncExternalStore(subscribe, getDensity, getDensity);
  const setDensity = useCallback((next) => setSharedListDensity(next), []);

  return [density, setDensity];
};

export default useSharedListDensity;
