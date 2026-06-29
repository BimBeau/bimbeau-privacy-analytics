import { Card, CardBody, CardHeader } from "@wordpress/components";
import { __ } from "@wordpress/i18n";

const ConsentComplianceNotice = () => (
  <Card>
    <CardHeader>
      <h4>{__("Consent compliance reminder", "bimbeau-privacy-analytics")}</h4>
    </CardHeader>
    <CardBody>
      <p>{__("BimBeau Privacy Analytics provides technical diagnostics only. Your CMP remains the source of truth for consent workflows.", "bimbeau-privacy-analytics")}</p>
    </CardBody>
  </Card>
);

export default ConsentComplianceNotice;
