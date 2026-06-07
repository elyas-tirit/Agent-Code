import { Icon, IconName } from "../../ui/Icon";

interface RailItem {
  id: string;
  icon: IconName;
  active?: boolean;
}

const ITEMS: RailItem[] = [
  { id: "agents", icon: "users", active: true },
  { id: "files", icon: "folder" },
  { id: "git", icon: "git-branch" },
  { id: "search", icon: "search" },
  { id: "settings", icon: "settings" },
];

export function ActivityRail() {
  return (
    <div
      className="flex h-full w-[70px] shrink-0 flex-col items-center justify-between rounded-[15px] py-4 backdrop-blur-md"
      style={{
        background:
          "linear-gradient(180deg, rgba(218,218,218,0.20) 0%, rgba(48,48,48,0.20) 58%)",
        boxShadow: "0 4px 18px rgba(0,0,0,0.25)",
      }}
    >
      <div className="flex flex-col items-center gap-2">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            title={item.id}
            className={`flex size-[45px] items-center justify-center rounded-full transition-colors ${
              item.active
                ? "bg-white/20 text-white shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                : "text-white/55 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon name={item.icon} size={22} />
          </button>
        ))}
      </div>
      <button
        title="Toggle panel"
        className="flex size-[40px] items-center justify-center rounded-xl text-white/55 hover:text-white"
      >
        <Icon name="panel-left" size={22} />
      </button>
    </div>
  );
}
