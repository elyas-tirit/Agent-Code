import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant/chat text as GitHub-flavored markdown (bold, code, lists,
 * headings, tables, links, blockquotes). Styling lives in styles.css under
 * `.ac-md` so the markup stays clean. Safe with partial/streaming input.
 */
export function Md({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`ac-md ${className}`}>
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}
