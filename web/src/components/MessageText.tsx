import { useState, Fragment } from "react";
import { createPortal } from "react-dom";

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Renders a single line of message text, converting URLs to clickable links with an external-link warning. */
export function MessageText({ text, className = "" }: { text: string; className?: string }) {
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);

  const parts = text.split(URL_RE);

  return (
    <>
      <span className={className}>
        {parts.map((part, i) =>
          URL_RE.test(part) ? (
            <button
              key={i}
              type="button"
              onClick={() => setConfirmUrl(part)}
              className="text-accent underline hover:opacity-80 cursor-pointer"
            >
              {part}
            </button>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          )
        )}
      </span>

      {confirmUrl && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.85)" }}
          onClick={() => setConfirmUrl(null)}
        >
          <div
            className="border border-accent rounded-lg bg-bg-base p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-sm font-semibold text-accent mb-3">External link</p>
            <p className="text-xs text-text-muted font-mono mb-2">You are about to visit:</p>
            <p className="text-xs text-text-primary font-mono break-all mb-4 bg-bg-elevated rounded px-3 py-2 border border-border">
              {confirmUrl}
            </p>
            <p className="text-xs text-text-muted font-mono mb-4">
              This link will take you to an external site. Only continue if you trust this URL.
            </p>
            <div className="flex items-center gap-3">
              <a
                href={confirmUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setConfirmUrl(null)}
                className="text-xs font-mono font-semibold px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity"
              >
                Open link
              </a>
              <button
                type="button"
                onClick={() => setConfirmUrl(null)}
                className="text-xs font-mono text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
