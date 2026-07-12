/**
 * SessionTabPanel — renders the one reference panel for the active tab. Keyed by
 * tab id; only the selected panel mounts (unselected elements are never rendered).
 * Tabs are pre-gated by lib/sessionTabs, so no per-panel caster/class/owner guard.
 */

import type { ReactNode } from "react";

import Card from "@/components/ui/Card";
import InventoryList from "@/features/inventory/InventoryList";
import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import SpellsSection from "@/features/spells/SpellsSection";
import SessionLog from "@/features/session/SessionLog";
import SessionLootPanel from "@/features/session/SessionLootPanel";
import type { LootRecipient } from "@/lib/sessionTabs";
import type { Character, Session, ClassOption } from "@/types/character";

interface SessionTabPanelProps {
  tab: string;
  character: Character;
  session: Session;
  referenceClasses: ClassOption[];
  recipients: LootRecipient[];
  logRefresh: number;
  onLogRefresh: () => void;
  onUpdate: (c: Character) => void;
}

export default function SessionTabPanel({
  tab,
  character,
  session,
  referenceClasses,
  recipients,
  logRefresh,
  onLogRefresh,
  onUpdate,
}: SessionTabPanelProps) {
  const panels: Record<string, ReactNode> = {
    inventory: <InventoryList character={character} onUpdate={onUpdate} />,
    spells: (
      <Card title="Spells" className="p-4">
        <SpellsSection character={character} onUpdate={onUpdate} />
      </Card>
    ),
    class: (
      <Card title="Class Features" className="p-4">
        <ClassFeaturesSection
          character={character}
          referenceClasses={referenceClasses}
          onUpdate={onUpdate}
        />
      </Card>
    ),
    log: (
      <Card title="Session Log" className="p-4">
        <SessionLog characterId={character.id} sessionId={session.id} refreshKey={logRefresh} />
      </Card>
    ),
    loot: (
      <Card title="Award Loot" className="p-4">
        <SessionLootPanel
          campaignId={session.campaignId}
          sessionId={session.id}
          recipients={recipients}
          onAwarded={onLogRefresh}
        />
      </Card>
    ),
  };

  return <>{panels[tab] ?? null}</>;
}
