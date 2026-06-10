import { useEffect, useState } from "react";
import type { DashboardState, DesignState } from "@shared/protocol";
import { bootstrap, post, onHostMessage, LANG } from "./vscode";
import { setLang, type Lang } from "./i18n";
import { AgentsDashboard } from "./views/dashboard/AgentsDashboard";
import { DesignWorkspace } from "./views/design/DesignWorkspace";

setLang(LANG); // apply the host-resolved language before the first render

export function App() {
  // Re-render the whole tree when the language changes (no remount → state kept;
  // every t() call just re-evaluates against the new module-level language).
  const [, bump] = useState<Lang>(LANG);
  useEffect(() => {
    post({ type: "ready" });
    return onHostMessage((m) => {
      const lang = m.type === "lang/set" ? m.lang : m.type === "init" ? m.lang : undefined;
      if (lang) {
        setLang(lang);
        bump(lang);
      }
    });
  }, []);

  if (bootstrap.view === "design") {
    return <DesignWorkspace initial={bootstrap.state as DesignState | undefined} />;
  }
  // The "changelog" data isn't a top-level view anymore — it's an overlay
  // rendered by AgentsDashboard when the host posts a `changelog/show` message.
  return <AgentsDashboard initial={bootstrap.state as DashboardState | undefined} />;
}
