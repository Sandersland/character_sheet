import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { concentratingArtState, poolForArt, summaryPools } from "@/lib/shadowArts";
import type { CastShadowArtOperation } from "@/types/character";
import ShadowArtRow from "@/features/class/ShadowArtRow";
import { useShadowArtsCatalog } from "@/features/class/useShadowArtsCatalog";

interface Props {
  busy: boolean;
  onCast: (op: CastShadowArtOperation) => void;
}

export default function ShadowArtsSection({ busy, onCast }: Props) {
  const { character } = useCurrentCharacter();
  const { catalog, error: catalogError, retry } = useShadowArtsCatalog(character.rulesEdition);
  const { concentratingOn, concentratingArtId } = concentratingArtState(character);
  const pools = summaryPools(character, catalog);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Shadow Arts
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      {pools.length > 0 && (
        <p className="mb-3 text-xs text-parchment-600">
          {pools.map((pool, i) => (
            <span key={pool.key} className={i > 0 ? "ml-3" : undefined}>
              {pool.label} remaining: <span className="font-semibold text-gold-800">{pool.remaining}</span>
            </span>
          ))}
        </p>
      )}

      {concentratingOn && (
        <p className="mb-3 rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs text-arcane-800" role="status">
          Concentrating on <span className="font-semibold">{concentratingOn.spellName}</span>
        </p>
      )}

      {catalogError ? (
        <p className="flex items-center justify-between rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {catalogError}
          <button type="button" onClick={retry} className="underline">
            Retry
          </button>
        </p>
      ) : (
        <ul className="divide-y divide-parchment-200">
          {(catalog ?? []).map((art) => {
            const pool = poolForArt(character, art);
            return (
              <ShadowArtRow
                key={art.id}
                art={art}
                poolAvailable={pool?.remaining ?? 0}
                poolLabel={pool?.label ?? "points"}
                busy={busy}
                isConcentrating={concentratingArtId === art.id}
                concentratingOnName={concentratingOn?.spellName ?? null}
                onCast={onCast}
              />
            );
          })}
          {catalog === null && (
            <li className="py-3 text-center text-sm text-parchment-600">Loading Shadow Arts…</li>
          )}
        </ul>
      )}
    </div>
  );
}
