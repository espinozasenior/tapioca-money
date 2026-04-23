import React, { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveRecipient } from "@/lib/ens/resolver";
import { shortenAddress } from "@/utils/shortenAddress";
import { PasteChip } from "./PasteChip";

export interface ResolvedRecipient {
  /** Raw user-typed string (ENS/Basename or 0x hex). */
  input: string;
  /** Checksummed 0x address, or null while unresolved/invalid. */
  address: `0x${string}` | null;
  /** Human-readable label when the input was a name; null otherwise. */
  label: string | null;
  /** True while resolution is in flight. */
  resolving: boolean;
  /** Resolution error code when resolution fails. */
  errorCode: "ENS_RESOLUTION_FAILED" | "INVALID_INPUT" | null;
}

interface RecipientInputProps {
  value: ResolvedRecipient;
  onChange: (next: ResolvedRecipient) => void;
  error?: string | null;
}

const RESOLVE_DEBOUNCE_MS = 400;

export function RecipientInput({ value, onChange, error }: RecipientInputProps) {
  const id = useId();
  const [isFocused, setFocused] = useState(false);
  const resolveSeq = useRef(0);

  // Debounced resolver: race-safe via sequence tag (discard stale responses).
  useEffect(() => {
    const input = value.input.trim();
    if (!input) {
      if (value.address || value.resolving || value.errorCode) {
        onChange({ input: value.input, address: null, label: null, resolving: false, errorCode: null });
      }
      return;
    }

    // 0x fast path — resolve synchronously.
    if (/^0x[a-fA-F0-9]{40}$/.test(input)) {
      if (value.address?.toLowerCase() !== input.toLowerCase() || value.resolving) {
        // Let the resolver handle checksum, but update optimistically.
        onChange({
          input: value.input,
          address: input as `0x${string}`,
          label: null,
          resolving: true,
          errorCode: null,
        });
      }
    }

    const seq = ++resolveSeq.current;
    const timer = setTimeout(async () => {
      const result = await resolveRecipient(input);
      if (seq !== resolveSeq.current) return; // stale
      if ("resolved" in result) {
        onChange({
          input: value.input,
          address: result.resolved,
          label: result.label ?? null,
          resolving: false,
          errorCode: null,
        });
      } else {
        onChange({
          input: value.input,
          address: null,
          label: null,
          resolving: false,
          errorCode: result.error,
        });
      }
    }, RESOLVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // Intentionally exclude `onChange` / `value` (other fields) to avoid re-debouncing on every keystroke side effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.input]);

  const handleTextChange = (text: string) => {
    onChange({ input: text, address: null, label: null, resolving: true, errorCode: null });
  };

  const handlePaste = (pasted: string) => {
    handleTextChange(pasted);
  };

  const resolvedAddressForDisplay =
    value.address && value.label ? shortenAddress(value.address) : null;

  const showNotFound = !!value.input.trim() && !value.resolving && value.errorCode === "ENS_RESOLUTION_FAILED";

  return (
    <div className="w-full">
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-gray-900">
        Recipient
      </label>

      <PasteChip visible={isFocused && !value.input} onPaste={handlePaste} />

      <div className="relative">
        <input
          id={id}
          type="text"
          placeholder="Address, ENS (luis.eth), or Basename"
          className={cn(
            "focus:border-primary h-12 w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none",
            (error || showNotFound) && "border-red-600"
          )}
          value={value.input}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="off"
          spellCheck={false}
        />
        {value.resolving && (
          <Loader2 className="text-muted-foreground absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" />
        )}
      </div>

      {resolvedAddressForDisplay && (
        <div className="text-muted-foreground mt-1.5 text-xs">
          Resolved: <span className="font-mono">{resolvedAddressForDisplay}</span>
        </div>
      )}
      {showNotFound && (
        <div className="mt-1.5 text-sm text-red-600">
          Couldn't resolve this name. Try the wallet address.
        </div>
      )}
      {error && !showNotFound && <div className="mt-1.5 text-sm text-red-600">{error}</div>}
    </div>
  );
}
