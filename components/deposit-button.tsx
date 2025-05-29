import Image from "next/image";

export function DepositButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex h-12 w-40 items-center justify-center gap-2 rounded-full bg-[#0D42E4] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0A2FA2]"
      onClick={onClick}
    >
      <Image src="/plus-icon-white.svg" alt="Add" width={24} height={24} /> Deposit
    </button>
  );
}
