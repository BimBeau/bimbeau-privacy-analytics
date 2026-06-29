import { Button, Card, CardBody, CardHeader } from "@wordpress/components";
import Notice from "../BrandNotice";
import { __ } from "@wordpress/i18n";
import { useState } from "@wordpress/element";
import { ADMIN_CONFIG } from "../../constants";
import { diagnoseAdvancedTrackerScriptsFromUrl } from "../../lib/advancedTrackerScriptDiagnostics";

const EnrichedTrackerDiagnosticCard = ({
  availableGranularities = [],
  frontUrl = ADMIN_CONFIG?.settings?.frontUrl || "/",
}) => {
  const [diagnostic, setDiagnostic] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostic = async () => {
    setIsRunning(true);
    const result = await diagnoseAdvancedTrackerScriptsFromUrl({ frontUrl });
    setDiagnostic(result);
    setIsRunning(false);
  };

  return (
    <Card>
      <CardHeader>
        <h4>{__("Enriched tracker diagnostic", "bimbeau-privacy-analytics")}</h4>
      </CardHeader>
      <CardBody>
        <p>
          {__(
            "This diagnostic separates script DOM presence, runtime execution, and enriched payload activity. It never proves user consent.",
            "bimbeau-privacy-analytics",
          )}
        </p>
        <p>{__("Available granularities", "bimbeau-privacy-analytics")}: {availableGranularities.join(", ") || "-"}</p>
        <Button variant="secondary" onClick={runDiagnostic} isBusy={isRunning}>
          {__("Run diagnostic", "bimbeau-privacy-analytics")}
        </Button>
        {diagnostic && (
          <>
            <p>{__("Status", "bimbeau-privacy-analytics")}: {diagnostic.status}</p>
            <p>{__("Reason", "bimbeau-privacy-analytics")}: {diagnostic.reason}</p>
            <p>
              {__("Detected scripts", "bimbeau-privacy-analytics")}: {diagnostic?.evidence?.matchedScripts?.length || 0}
            </p>
            <p>
              {__("CMP markers", "bimbeau-privacy-analytics")}: {diagnostic?.evidence?.cmpMarkers?.length || 0}
            </p>
          </>
        )}
        <Notice status="warning" isDismissible={false}>
          {__("Legal caution: technical diagnostics do not establish legal consent.", "bimbeau-privacy-analytics")}
        </Notice>
      </CardBody>
    </Card>
  );
};

export default EnrichedTrackerDiagnosticCard;
