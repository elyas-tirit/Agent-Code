import type { ChangelogVisual } from "@shared/protocol";
import { MEDIA } from "../../vscode";
import { ToastMock } from "./visuals/ToastMock";
import { PaletteMock } from "./visuals/PaletteMock";
import { SizeChart } from "./visuals/SizeChart";

/**
 * Dispatches a `ChangelogVisual` payload to its renderer. Adding a new visual
 * kind is: add a case to the protocol union, drop a component under `visuals/`,
 * add a branch here. Stays exhaustive via the never-fallthrough.
 */
export function Visual({ visual }: { visual: ChangelogVisual }) {
  const wrap = (children: React.ReactNode) => (
    <div
      className="rounded-2xl border border-white/[0.06] p-6 my-2 mx-5 min-h-[160px] flex items-center justify-center relative overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 100% at 0% 0%, rgba(64, 103, 232, 0.12) 0%, transparent 60%), radial-gradient(120% 100% at 100% 100%, rgba(112, 255, 243, 0.1) 0%, transparent 60%), #0a0a0a",
      }}
    >
      {children}
    </div>
  );

  switch (visual.kind) {
    case "toast":
      return wrap(<ToastMock title={visual.title} body={visual.body} buttons={visual.buttons} />);
    case "palette":
      return wrap(<PaletteMock query={visual.query} items={visual.items} />);
    case "sizeChart":
      return wrap(<SizeChart rows={visual.rows} />);
    case "image":
      return wrap(
        <img
          src={MEDIA ? `${MEDIA}/${visual.src}` : visual.src}
          alt={visual.alt}
          className="max-w-full max-h-[280px] rounded-lg"
        />,
      );
    default: {
      const _exhaustive: never = visual;
      return _exhaustive;
    }
  }
}
