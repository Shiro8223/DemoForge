import { Fragment } from "react";

/** Tiny Markdown renderer for summary.md (headings, lists, paragraphs, bold, italics, code). No HTML passthrough. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="text-fg">{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="rounded border border-black bg-pop-yellow/50 px-1 py-0.5 font-mono text-[0.85em] text-black">{p.slice(1, -1)}</code>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={list.ordered ? "ml-5 list-decimal space-y-1" : "ml-5 list-disc space-y-1"}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>,
    );
    list = null;
  };
  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      const cls = h[1].length === 1 ? "font-display text-xl font-bold mt-2" : "font-display text-base uppercase tracking-wider text-black mt-5";
      blocks.push(<p key={blocks.length} className={cls}>{inline(h[2])}</p>);
    } else if (ul || ol) {
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
    } else if (!line.trim()) flush();
    else {
      flush();
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-fg">{blocks}</div>;
}
