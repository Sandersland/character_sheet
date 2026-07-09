import type { ResourceOperation, ResourcePool } from "@/types/character";
import ResourcePoolRow from "@/features/class/ResourcePoolRow";

interface Props {
  characterId: string;
  pools: ResourcePool[];
  busy: boolean;
  onOperations: (ops: ResourceOperation[]) => void;
}

export default function ResourcePoolsSection({ characterId, pools, busy, onOperations }: Props) {
  return (
    <div>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Resources
      </h3>
      <div className="flex flex-col gap-4">
        {pools.map((pool) => (
          <ResourcePoolRow
            key={pool.key}
            characterId={characterId}
            pool={pool}
            busy={busy}
            onOperations={onOperations}
          />
        ))}
      </div>
    </div>
  );
}
