import { Card, CardBody, CardHeader } from "@wordpress/components";
import Notice from "../BrandNotice";
import { __ } from "@wordpress/i18n";

const PrivacyRuntimeStateNotice = ({ availableGranularities = [] }) => (
  <Card>
    <CardHeader>
      <h4>{__("Privacy runtime diagnostics", "bimbeau-privacy-analytics")}</h4>
    </CardHeader>
    <CardBody>
      <p>{__("Runtime granularity is reported from available granularities.", "bimbeau-privacy-analytics")}</p>
      <p>{availableGranularities.join(", ") || "-"}</p>
      <Notice status="warning" isDismissible={false}>
        {__("Technical state does not prove consent collection validity.", "bimbeau-privacy-analytics")}
      </Notice>
    </CardBody>
  </Card>
);

export default PrivacyRuntimeStateNotice;
