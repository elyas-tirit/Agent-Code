import { useEffect, useState } from "react";
import type { DashboardState } from "@shared/protocol";
import { mediaUrl, onHostMessage, post } from "../../vscode";
import { TopBar } from "./TopBar";
import { AgentCard } from "./AgentCard";
import { NewAgentCard } from "./NewAgentCard";
import { UsageModal } from "../../ui/UsageModal";
import { SettingsModal } from "../../ui/SettingsModal";
import { t } from "../../i18n";

const EMPTY: DashboardState = {
  greeting: t("Hi", "Ciao"),
  usage: { percent: 0, resetsInLabel: "", known: false },
  agents: [],
};

export function AgentsDashboard({ initial }: { initial?: DashboardState }) {
  const [state, setState] = useState<DashboardState>(initial ?? EMPTY);
  const [usageOpen, setUsageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === "init" && msg.view === "dashboard") setState(msg.state);
      else if (msg.type === "dashboard/state") setState(msg.state);
      else if (msg.type === "usage/update") setState((s) => ({ ...s, usage: msg.usage }));
    });
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Ambient background video — light, Color Dodge blend, looping */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <video
          src={mediaUrl("bg-loop.mp4")}
          autoPlay
          loop
          muted
          playsInline
          className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 object-cover"
          style={{ opacity: 0.06, mixBlendMode: "color-dodge" }}
        />
        <div className="absolute -top-40 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-[#3c62da]/15 blur-[120px]" />
        <div className="absolute -bottom-40 right-0 size-[420px] rounded-full bg-[#3c62da]/10 blur-[120px]" />
        <div className="ac-breathe absolute left-10 top-1/3 size-[300px] rounded-full bg-[#70fff3]/[0.05] blur-[120px]" />
      </div>

      <div className="relative flex h-full flex-col px-8 py-5">
        <TopBar
          greeting={state.greeting}
          usage={state.usage}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenUsage={() => setUsageOpen(true)}
        />

        <div className="mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="ac-stagger grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-8">
            {/* Primary action — always first: opens a new Claude Code chat */}
            <NewAgentCard onClick={() => post({ type: "agent/new" })} />

            {state.agents.map((card) => (
              <AgentCard
                key={card.id}
                card={card}
                onAction={(actionId) => post({ type: "agent/action", agentId: card.id, actionId })}
                onOpen={() => post({ type: "agent/open", agentId: card.id })}
              />
            ))}
          </div>
        </div>
      </div>

      {usageOpen && (
        <UsageModal
          usage={state.usage}
          title={t("Total usage", "Uso totale")}
          scope={t("Tokens and limits consumed by all agents, on your Claude subscription.", "Token e limiti consumati da tutti gli agenti, sul tuo abbonamento Claude.")}
          onClose={() => setUsageOpen(false)}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
