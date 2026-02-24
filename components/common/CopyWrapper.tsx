import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, Square2StackIcon } from "@heroicons/react/24/outline";

interface CopyWrapperProps {
  toCopy?: string;
  className?: string;
  children?: ReactNode;
  iconPosition?: "left" | "right";
}

export function CopyWrapper({
  toCopy,
  className,
  children,
  iconPosition = "left",
}: CopyWrapperProps) {
  const [justCopied, setJustCopied] = useState(false);

  const iconClasses = "w-4 h-4";
  const icon = justCopied ? (
    <CheckIcon className={cn(iconClasses, "text-emerald-500")} />
  ) : (
    <Square2StackIcon className={iconClasses} />
  );

  return (
    <button
      className={cn(
        "flex cursor-pointer items-center gap-2",
        iconPosition === "right" && "flex-row-reverse",
        justCopied && "text-emerald-500",
        className
      )}
      // onPointerDown necessary for when CopyWrapper is used inside a Radix Dropdown
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(toCopy ?? "").then(() => {
          setJustCopied(true);
          setTimeout(() => setJustCopied(false), 3000);
        });
      }}
      data-testid="copy-wrapper"
    >
      {icon}
      {children ?? (justCopied ? "Copied" : "Copy")}
    </button>
  );
}
