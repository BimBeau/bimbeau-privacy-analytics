/**
 * Premium admin entry point for BimBeau Privacy Analytics.
 */

import { bootstrapAdmin } from "./bootstrap-common";
import "./premium/styles/page-details.css";
import {
  registerBPAServiceWorker,
  setupEventConfigDropPlaceholder,
} from "./bootstrap-premium";

bootstrapAdmin({
  beforeRender: [setupEventConfigDropPlaceholder],
  afterRender: [registerBPAServiceWorker],
});
