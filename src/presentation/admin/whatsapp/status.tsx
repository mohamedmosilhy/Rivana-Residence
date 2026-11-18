import { Badge } from "@/presentation/admin/ui/badge";
import {
  descriptionList,
  readiness,
  readinessGaps,
} from "@/presentation/admin/ui/classes";

import { languageLabel, purposeLabel } from "./labels";

export type SetupGapView = Readonly<{
  purpose: string;
  language: string;
  blocking: boolean;
}>;

export type SetupStatusProps = Readonly<{
  configured: boolean;
  accessTokenConfigured: boolean;
  numberSet: boolean;
  phoneNumberIdSet: boolean;
  setupGaps: readonly SetupGapView[];
  lastTest: Readonly<{ at: string; ok: boolean; error: string | null }> | null;
}>;

/**
 * Whether WhatsApp counts as configured (Q-71) and what is still missing.
 * Status is always written out; colour only reinforces it. The access token
 * is shown as a yes or no, never as a value.
 */
export function WhatsAppSetupStatus({
  configured,
  accessTokenConfigured,
  numberSet,
  phoneNumberIdSet,
  setupGaps,
  lastTest,
}: SetupStatusProps) {
  const blocking = setupGaps.filter((gap) => gap.blocking);
  const later = setupGaps.filter((gap) => !gap.blocking);
  return (
    <>
      <p className="mb-0">
        <Badge tone={configured ? "success" : "warning"}>
          {configured ? "Configured" : "Not configured"}
        </Badge>
      </p>
      <dl className={descriptionList}>
        <div>
          <dt>Business number</dt>
          <dd>{numberSet ? "Entered" : "Not entered yet"}</dd>
        </div>
        <div>
          <dt>Phone number id</dt>
          <dd>{phoneNumberIdSet ? "Entered" : "Not entered yet"}</dd>
        </div>
        <div>
          <dt>Access token</dt>
          <dd>
            {accessTokenConfigured
              ? "Configured on the server"
              : "Not configured on the server"}
          </dd>
        </div>
        <div>
          <dt>Last test message</dt>
          <dd>
            {lastTest
              ? `${lastTest.ok ? "Sent" : "Failed"} on ${lastTest.at}${lastTest.error ? `: ${lastTest.error}` : ""}`
              : "None yet"}
          </dd>
        </div>
      </dl>
      {!accessTokenConfigured ? (
        <div className={readiness}>
          <p>
            The access token is set by the developer on the server
            (WHATSAPP_ACCESS_TOKEN). It cannot be entered here.
          </p>
        </div>
      ) : null}
      {blocking.length > 0 ? (
        <div className={readiness}>
          <p>
            Online booking needs these templates before WhatsApp counts as
            configured:
          </p>
          <ul>
            {blocking.map((gap) => (
              <li key={`${gap.purpose}:${gap.language}`}>
                {purposeLabel(gap.purpose)} ({languageLabel(gap.language)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {later.length > 0 ? (
        <div className={readinessGaps}>
          <p>
            No active template yet for these messages (not needed to go online):
          </p>
          <ul>
            {later.map((gap) => (
              <li key={`${gap.purpose}:${gap.language}`}>
                {purposeLabel(gap.purpose)} ({languageLabel(gap.language)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
