import { Link } from "react-router-dom";

import { MENTION_CHIP_TONE_CLASS } from "@/lib/mentions";
import type { EntityConnection } from "@/types/character";

// Co-mention chips (#842): entities sharing notes with this one, tinted + linked.
export default function EntityConnections({
  connections,
  campaignId,
}: {
  connections: EntityConnection[];
  campaignId?: string;
}) {
  if (connections.length === 0) return null;
  return (
    <section aria-labelledby="entity-connections-heading" className="flex flex-col gap-2">
      <h2
        id="entity-connections-heading"
        className="font-display text-lg font-semibold text-parchment-900"
      >
        Connections
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {connections.map(({ entity, count }) => (
          <li key={entity.id}>
            <Link
              to={`/campaigns/${campaignId}/entities/${entity.id}`}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium hover:opacity-80 ${MENTION_CHIP_TONE_CLASS[entity.type]}`}
            >
              {entity.name}
              <span className="opacity-70">×{count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
