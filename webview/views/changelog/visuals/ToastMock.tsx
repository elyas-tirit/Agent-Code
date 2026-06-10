/**
 * Mock of a VS Code information toast — used inside changelog cards that talk
 * about a real toast (e.g. the auto-update prompt). Plain visual, no behavior.
 */
export function ToastMock({
  title,
  body,
  buttons,
}: {
  title: string;
  body?: string;
  buttons: { label: string; primary?: boolean }[];
}) {
  return (
    <div
      className="rounded-md border border-white/10 px-4 py-3 max-w-[420px] w-full"
      style={{
        background: "#252526",
        fontFamily: "-apple-system, 'Segoe UI', system-ui, sans-serif",
        fontSize: 13,
        color: "#cccccc",
        boxShadow: "0 12px 30px rgba(0, 0, 0, 0.45)",
      }}
    >
      <div className="leading-snug mb-1.5" style={{ color: "#fff" }}>
        <strong>{title}</strong>
      </div>
      {body ? (
        <div style={{ color: "#969696", fontSize: 12 }}>{body}</div>
      ) : null}
      <div className="flex gap-2 justify-end mt-2.5">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            className="px-3.5 py-[5px] text-[12.5px] rounded-sm"
            style={{
              background: b.primary ? "#0e639c" : "#3a3d41",
              color: "#fff",
              fontFamily: "inherit",
              border: "none",
              cursor: "default",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
