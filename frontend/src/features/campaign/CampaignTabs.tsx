import { useNavigate } from "react-router-dom";

import Tabs from "@/components/ui/Tabs";

interface CampaignTabsProps {
  campaignId: string;
  isOwner: boolean;
  entityCount: number;
  active: "overview" | "codex" | "manage";
}

function tabPath(campaignId: string, tab: string): string {
  if (tab === "codex") return `/campaigns/${campaignId}/codex`;
  if (tab === "manage") return `/campaigns/${campaignId}/manage`;
  return `/campaigns/${campaignId}`;
}

export default function CampaignTabs({ campaignId, isOwner, entityCount, active }: CampaignTabsProps) {
  const navigate = useNavigate();
  return (
    <Tabs
      tabs={[
        { id: "overview", label: "Overview" },
        // Hidden at 0 so a cold cache doesn't flash "Codex 0" before the fetch resolves.
        { id: "codex", label: "Codex", badge: entityCount > 0 ? entityCount : undefined },
        ...(isOwner ? [{ id: "manage", label: "Manage" }] : []),
      ]}
      active={active}
      onChange={(tab) => navigate(tabPath(campaignId, tab))}
    />
  );
}
