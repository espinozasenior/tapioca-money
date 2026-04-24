import React, { useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { isAddress } from "viem";

interface PasteChipProps {
  visible: boolean;
  onPaste: (value: string) => void;
}

function looksLikeName(input: string): boolean {
  return /^[^\s]+\.[^\s]+$/.test(input) && !input.startsWith("0x");
}

function isCandidate(input: string): boolean {
  if (!input) return false;
  const trimmed = input.trim();
  if (trimmed.length > 128) return false;
  return isAddress(trimmed) || looksLikeName(trimmed);
}

/**
 * Renders a visible "Paste from clipboard" button when the recipient input
 * is focused and empty. The click handler reads the clipboard (user gesture
 * satisfies browser permission policy), validates the content, and calls
 * onPaste only if it looks like a 0x / ENS / Basename.
 *
 * We deliberately do NOT auto-read on focus — that path requires transient
 * user activation which focus alone doesn't grant in Chromium, and a strict
 * CSP / Permissions-Policy on the host page can silently block it. A
 * visible button that reads on click is the one path that works everywhere.
 */
export function PasteChip({ visible, onPaste }: PasteChipProps) {
  const [status, setStatus] = useState<"idle" | "reading" | "blocked" | "empty">("idle");

  if (!visible) return null;

  const handleClick = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      setStatus("blocked");
      return;
    }
    setStatus("reading");
    try {
      const text = await navigator.clipboard.readText();
      if (isCandidate(text)) {
        onPaste(text.trim());
        setStatus("idle");
      } else {
        setStatus("empty");
      }
    } catch {
      setStatus("blocked");
    }
  };

  const label =
    status === "reading"
      ? "Reading clipboard…"
      : status === "blocked"
        ? "Paste denied by browser"
        : status === "empty"
          ? "Clipboard has no address or name"
          : "Paste from clipboard";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "reading"}
      className="mb-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
    >
      <ClipboardPaste className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
