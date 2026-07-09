import type { ClassFeature } from "@/types/character";

interface Props {
  features: ClassFeature[];
}

export default function ClassFeaturesList({ features }: Props) {
  if (features.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Class Features
      </h3>
      <ul className="flex flex-col gap-3">
        {features.map((feature) => (
          <li key={`${feature.source}-${feature.name}`}>
            <p className="text-sm font-semibold text-parchment-900">
              {feature.name}
              {feature.source === "subclass" && (
                <span className="ml-1.5 text-[11px] font-normal text-parchment-600">subclass</span>
              )}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-parchment-600">
              {feature.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
