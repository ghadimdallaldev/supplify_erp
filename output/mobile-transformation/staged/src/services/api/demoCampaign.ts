import { apiUrl } from "../../config/env";
import type {
  DemoCampaignLeadInput,
  DemoCampaignEventInput,
  DemoCampaignResult,
} from "../../types/demoCampaign";

/** Anonymous campaign calls must never attach ERP bearer tokens, refresh a session or clear it. */
export async function submitDemoCampaignLead(
  input: DemoCampaignLeadInput,
): Promise<DemoCampaignResult> {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/api/public/demo/leads`,
    {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "Supplify",
      },
      body: JSON.stringify(input),
    },
  );
  const result = (await response.json()) as DemoCampaignResult;
  return { ...result, ok: response.ok && result.ok };
}

export async function recordDemoCampaignEvent(
  input: DemoCampaignEventInput,
): Promise<boolean> {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/api/public/demo/events`,
    {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "Supplify",
      },
      body: JSON.stringify(input),
    },
  );
  return response.ok;
}
