export const SETUP_WIZARD_COMPLETED_FLASH = "bbpa_setup_wizard_completed_flash";

export const reloadAdminPage = () => window.location.reload();

export const persistSetupWizardCompletedFlash = () => {
  try {
    window.sessionStorage.setItem(SETUP_WIZARD_COMPLETED_FLASH, "1");
  } catch (error) {
    // A full reload remains safe when browser storage is unavailable.
  }
};

export const consumeSetupWizardCompletedFlash = () => {
  try {
    const shouldShow =
      window.sessionStorage.getItem(SETUP_WIZARD_COMPLETED_FLASH) === "1";
    window.sessionStorage.removeItem(SETUP_WIZARD_COMPLETED_FLASH);
    return shouldShow;
  } catch (error) {
    return false;
  }
};
