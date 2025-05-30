import Image from "next/image";

export function DepositButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-31 flex h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 md:w-40"
      onClick={onClick}
    >
      <Image src="/plus-icon-white.svg" alt="Add" width={24} height={24} /> Deposit
    </button>
  );
}
