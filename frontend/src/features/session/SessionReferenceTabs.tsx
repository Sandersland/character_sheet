/**
 * SessionReferenceTabs — the SessionPage's secondary reference area: the tab bar
 * plus (via SessionTabPanel) the active panel. Tab visibility and the gated-away
 * fallback come from lib/sessionTabs.
 */

import Tabs from "@/components/ui/Tabs";
import SessionTabPanel from "@/features/session/SessionTabPanel";
import { buildSessionTabs, resolveActiveTab, remainingSpellSlots, sessionRecipients } from "@/lib/sessionTabs";
import type { Character, Session, ReferenceData } from "@/types/character";

interface SessionReferenceTabsProps {
  character: Character;
  session: Session;
  reference: ReferenceData | null;
  isOwner: boolean;
  activeTab: string;
  onTabChange: (id: string) => void;
  logRefresh: number;
  onLogRefresh: () => void;
  onUpdate: (c: Character) => void;
}

export default function SessionReferenceTabs({
  character,
  session,
  reference,
  isOwner,
  activeTab,
  onTabChange,
  logRefresh,
  onLogRefresh,
  onUpdate,
}: SessionReferenceTabsProps) {
  const remainingSlots = remainingSpellSlots(character);

  const tabs = buildSessionTabs({
    isCaster: Boolean(character.spellcasting),
    hasClass: Boolean(character.class),
    isOwner,
  }).map((t) =>
    t.id === "spells" && remainingSlots > 0
      ? {
          ...t,
          badge: (
            <span className="ml-1 rounded-full bg-arcane-700 px-1.5 py-0.5 text-[10px] font-bold text-parchment-50">
              {remainingSlots}
            </span>
          ),
        }
      : t,
  );

  const effectiveTab = resolveActiveTab(tabs, activeTab);

  return (
    <div className="flex flex-col gap-3">
      <Tabs tabs={tabs} active={effectiveTab} onChange={onTabChange} />
      <SessionTabPanel
        tab={effectiveTab}
        character={character}
        session={session}
        referenceClasses={reference?.classes ?? []}
        recipients={sessionRecipients(session)}
        logRefresh={logRefresh}
        onLogRefresh={onLogRefresh}
        onUpdate={onUpdate}
      />
    </div>
  );
}
