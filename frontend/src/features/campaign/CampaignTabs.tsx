import { useNavigate } from "react-router-dom";

import Tabs from "@/components/ui/Tabs";

interface CampaignTabsProps {
  campaignId: string;
  isOwner: boolean;
  entityCount: number;
  active: "overview" | "codex" | "manage";
}

// Routes for each tab id; Overview is the bare campaign path.
function tabPath(campaignId: string, tab: string): string {
  if (tab === "codex") return `/campaigns/${campaignId}/codex`;
  if (tab === "manage") return `/campaigns/${campaignId}/manage`;
  return `/campaigns/${campaignId}`;
}

// The campaign hub's routed tab strip (#367) — tab clicks navigate (push).
export default function CampaignTabs({ campaignId, isOwner, entityCount, active }: CampaignTabsProps) {
  const navigate = useNavigate();
  return (
    <Tabs
      tabs={[
        { id: "overview", label: "Overview" },
        // Hidden at 0 so a cold cache doesn't flash "Codex 0" before the fetch resolves.
        { id: "codex", label: "Codex", badge: entityCount > 0 ? entityCount : undefined },
        // Manage is the DM's private admin surface — owners only.
        ...(isOwner ? [{ id: "manage", label: "Manage" }] : []),
      ]}
      active={active}
      onChange={(tab) => navigate(tabPath(campaignId, tab))}
    />
  );
}
