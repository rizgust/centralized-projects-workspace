import { useEffect, useRef, useState } from "react";
import type { RunEvent } from "../api/types";
import { clock } from "../fmt";

/** Streaming run event log, formatted by kind. Auto-scrolls unless the user scrolled up. */
export function RunLog({ events, tail, compact }: { events: RunEvent[]; tail?: number; compact?: boolean }) {
  const ref = useRef<HTMLOListElement>(null);
  const [stick, setStick] = useState(true);
  const shown = tail ? events.slice(-tail) : events;

  useEffect(() => {
    const el = ref.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [shown.length, stick]);

  if (!events.length) return <p className="muted">No events yet.</p>;
  return (
    <ol
      ref={ref}
      className={`runlog${compact ? " compact" : ""}`}
      aria-label="Run event log"
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget;
        setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
      }}
    >
      {shown.map((ev) => (
        <li key={ev.seq} className={`ev ev-${ev.kind}`}>
          <time className="ev-time">{clock(ev.ts)}</time>
          <EventBody ev={ev} />
        </li>
      ))}
    </ol>
  );
}

function EventBody({ ev }: { ev: RunEvent }) {
  switch (ev.kind) {
    case "tool_use":
      return (
        <details className="ev-tool">
          <summary>
            <span className="ev-tag">tool</span> <strong>{ev.tool ?? "tool"}</strong> <span className="ev-preview">{ev.text.split("\n")[0].slice(0, 90)}</span>
          </summary>
          <pre>{ev.text}</pre>
        </details>
      );
    case "tool_result":
      return (
        <details className="ev-tool">
          <summary>
            <span className="ev-tag">result</span> <span className="ev-preview">{ev.text.split("\n")[0].slice(0, 100)}</span>
          </summary>
          <pre>{ev.text}</pre>
        </details>
      );
    case "stderr":
      return (
        <span className="ev-text">
          <span className="ev-tag tag-err">stderr</span> {ev.text}
        </span>
      );
    case "result":
      return (
        <span className="ev-text">
          <span className="ev-tag tag-result">result</span> <strong>{ev.text}</strong>
        </span>
      );
    case "system":
      return (
        <span className="ev-text muted">
          <span className="ev-tag">system</span> {ev.text}
        </span>
      );
    default:
      return <span className="ev-text">{ev.text}</span>;
  }
}
