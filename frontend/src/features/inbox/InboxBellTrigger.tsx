import { Bell } from "@/components/ui/icons";

interface InboxBellTriggerProps {
  count: number;
}

export default function InboxBellTrigger({ count }: InboxBellTriggerProps) {
  return (
    <span className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-parchment-100">
      <Bell aria-hidden="true" className="h-5 w-5 text-parchment-700" />
      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-garnet-surface px-1 text-[10px] font-bold leading-none text-garnet-on-surface">
        {count > 9 ? "9+" : count}
      </span>
    </span>
  );
}
