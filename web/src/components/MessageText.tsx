import { useState, useEffect, useRef, Fragment } from "react";
import { createPortal } from "react-dom";

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"')\]]+)/g;
// Non-global regex for stateless test() calls
const URL_TEST_RE = /^https?:\/\//;

/** Renders a single line of message text, converting URLs to clickable links with an external-link warning. */
export function MessageText({ text, className = "" }: { text: string; className?: string }) {
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const openBtnRef = useRef<HTMLAnchorElement>(null);

  const parts = text.split(URL_SPLIT_RE);

  // Escape to close, focus trap between Cancel and Open buttons, return focus on close
  useEffect(() => {
    if (!confirmUrl) return;

    // Move focus into dialog
    requestAnimationFrame(() => cancelBtnRef.current?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirmUrl(null);
        return;
      }
      if (e.key === "Tab") {
        const first = cancelBtnRef.current;
        const last = openBtnRef.current;
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Return focus to the link that opened the dialog
      triggerRef.current?.focus();
    };
  }, [confirmUrl]);

  return (
    <>
      <span className={className}>
        {parts.map((part, i) =>
          URL_TEST_RE.test(part) ? (
            <button
              key={i}
              type="button"
              onClick={(e) => { triggerRef.current = e.currentTarget; setConfirmUrl(part); }}
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="external-link-title"
          aria-describedby="external-link-desc"
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.85)" }}
          onClick={() => setConfirmUrl(null)}
        >
          <div
            className="border border-accent rounded-lg bg-bg-base p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="external-link-title" className="font-mono text-sm font-semibold text-accent mb-3">External link</p>
            <p className="text-xs text-text-muted font-mono mb-2">You are about to visit:</p>
            <p className="text-xs text-text-primary font-mono break-all mb-4 bg-bg-elevated rounded px-3 py-2 border border-border">
              {confirmUrl}
            </p>
            <p id="external-link-desc" className="text-xs text-text-muted font-mono mb-4">
              This link will take you to an external site. Only continue if you trust this URL.
            </p>
            <div className="flex items-center gap-3">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={() => setConfirmUrl(null)}
                className="text-xs font-mono text-text-muted hover:text-text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base rounded"
              >
                Cancel
              </button>
              <a
                ref={openBtnRef}
                href={confirmUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setConfirmUrl(null)}
                className="text-xs font-mono font-semibold px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
              >
                Open link
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
