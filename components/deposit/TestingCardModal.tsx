import { cn } from "@/lib/utils";
import { CheckIcon, Square2StackIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { useEffect, useState } from "react";

export function TestingCardModal() {
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    if (justCopied) {
      setTimeout(() => {
        setJustCopied(false);
      }, 3_000);
    }
  }, [justCopied]);

  const iconClasses = cn("w-4 h-4");

  const icon = justCopied ? (
    <CheckIcon className={cn(iconClasses, "text-[#36B37E]")} />
  ) : (
    <Square2StackIcon className={iconClasses} />
  );

  return (
    <div className="z-60 fixed right-6 top-6 w-[419px] space-y-3 rounded-3xl bg-white p-5 shadow-md">
      <div className="flex items-center gap-5 text-lg font-medium">
        <Image src="/credit-card-outline.svg" alt="Credit Card" width={24} height={24} />
        <span>Test payments</span>
      </div>
      <p className="text-gray-500">Use the following test card to complete your payment</p>
      <div>
        <div className="w-full">
          <div className="border-console-border flex items-center justify-between gap-2 rounded-md border py-1 pl-3 pr-1 shadow-sm">
            <span className="truncate  text-sm">4242 4242 4242 4242</span>
            <button
              className={cn(
                "text-custom-text-secondary border-console-border text-console-label flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-xs font-medium transition hover:text-[#273E43]",
                justCopied && "!text-[#36B37E]"
              )}
              // onPointerDown necessary for when CopyWrapper is used inside a Radix Dropdown
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigator.clipboard?.writeText("4242 4242 4242 4242").then(() => {
                  setJustCopied(true);
                });
              }}
              data-testid="copy-wrapper"
            >
              {icon}
              {justCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
