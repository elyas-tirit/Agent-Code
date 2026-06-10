/**
 * Horizontal bar chart used for "before/after" size comparisons. `weight` is
 * the relative width as a percentage (0-100); the longest bar should be 100.
 */
export function SizeChart({
  rows,
}: {
  rows: { label: string; size: string; weight: number; color: "before" | "after" }[];
}) {
  return (
    <div className="w-full max-w-[520px]">
      {rows.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          className="flex items-center gap-3.5"
          style={{ marginBottom: i === rows.length - 1 ? 0 : 12 }}
        >
          <div className="w-[90px] text-right text-[13px] font-semibold text-white/80">
            {row.label}
          </div>
          <div className="flex-1 h-6 rounded-md overflow-hidden relative" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div
              className="h-full rounded-md flex items-center px-2.5 text-[12px] font-semibold whitespace-nowrap"
              style={{
                width: `${Math.max(2, Math.min(100, row.weight))}%`,
                background:
                  row.color === "before"
                    ? "linear-gradient(90deg, #fb7185, #f87171)"
                    : "linear-gradient(90deg, #70fff3, #4ade80)",
                color: "#0a0a0a",
              }}
            >
              {row.size}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
