import React, { useEffect, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { isAddress } from "viem";
import { shortenAddress } from "@/utils/shortenAddress";

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
 * Offers a one-tap paste when the clipboard contains a valid recipient
 * (0x address, ENS name, or Basename). Respects browser permission rules:
 * - Chromium/Firefox desktop: auto-reads on visible=true.
 * - Safari / iOS: clipboard read requires a direct user gesture, so we
 *   render a generic "Paste from clipboard" button that reads on tap.
 */
export function PasteChip({ visible, onPaste }: PasteChipProps) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!visible) {
      setSuggestion(null);
      setNeedsGesture(false);
      return;
    }

    (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
          setNeedsGesture(true);
          return;
        }
        const text = await navigator.clipboard.readText();
        if (cancelled) return;
        if (isCandidate(text)) {
          setSuggestion(text.trim());
          setNeedsGesture(false);
        } else {
          setSuggestion(null);
          setNeedsGesture(false);
        }
      } catch {
        // Permission denied / needs gesture.
        if (!cancelled) setNeedsGesture(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleTapWithGesture = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (isCandidate(text)) {
        onPaste(text.trim());
      }
    } catch {
      // User declined; no-op.
    }
  };

  if (!visible) return null;

  if (suggestion) {
    const short = isAddress(suggestion) ? shortenAddress(suggestion) : suggestion;
    return (
      <button
        type="button"
        onClick={() => onPaste(suggestion)}
        className="mb-2 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
      >
        <ClipboardPaste className="h-3.5 w-3.5" />
        Paste {short}
      </button>
    );
  }

  if (needsGesture) {
    return (
      <button
        type="button"
        onClick={handleTapWithGesture}
        className="mb-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <ClipboardPaste className="h-3.5 w-3.5" />
        Paste from clipboard
      </button>
    );
  }

  return null;
}
