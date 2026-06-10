/**
 * Mock of the VS Code command palette — used to illustrate new commands.
 * The first item with `active: true` is rendered as selected (blue highlight).
 */
export function PaletteMock({
  query,
  items,
}: {
  query: string;
  items: { title: string; category: string; active?: boolean }[];
}) {
  return (
    <div
      className="rounded-md border border-white/10 w-[560px] max-w-full overflow-hidden"
      style={{
        background: "#252526",
        fontFamily: "-apple-system, 'Segoe UI', sans-serif",
        fontSize: 13,
        color: "#cccccc",
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5)",
      }}
    >
      <div
        className="px-2.5 py-1.5 border-b"
        style={{ background: "#3c3c3c", borderColor: "#1e1e1e" }}
      >
        {query}
        <span
          className="inline-block align-middle ml-0.5"
          style={{
            width: 1,
            height: 14,
            background: "#fff",
            animation: "ac-blink 1s steps(1) infinite",
          }}
        />
      </div>
      {items.map((item, i) => (
        <div
          key={`${item.title}-${i}`}
          className="px-3 py-1.5 flex justify-between text-[12.5px]"
          style={
            item.active
              ? { background: "#094771", color: "#fff" }
              : undefined
          }
        >
          <span>{item.title}</span>
          <span style={{ color: "#969696", fontSize: 11.5 }}>{item.category}</span>
        </div>
      ))}
    </div>
  );
}
