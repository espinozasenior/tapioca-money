import Image from "next/image";
import { CopyWrapper } from "../common/CopyWrapper";

export function TestingCardModal() {
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
            <span className="truncate text-sm">4242 4242 4242 4242</span>
            <CopyWrapper
              toCopy="4242 4242 4242 4242"
              className="border-console-border rounded-md border px-4 py-2 text-xs font-medium transition"
              iconPosition="right"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
