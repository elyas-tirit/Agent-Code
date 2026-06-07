import { useEffect } from "react";
import type { DashboardState, DesignState } from "@shared/protocol";
import { bootstrap, post } from "./vscode";
import { AgentsDashboard } from "./views/dashboard/AgentsDashboard";
import { DesignWorkspace } from "./views/design/DesignWorkspace";

export function App() {
  useEffect(() => {
    post({ type: "ready" });
  }, []);

  if (bootstrap.view === "design") {
    return <DesignWorkspace initial={bootstrap.state as DesignState | undefined} />;
  }
  return <AgentsDashboard initial={bootstrap.state as DashboardState | undefined} />;
}
