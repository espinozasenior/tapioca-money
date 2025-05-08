import Image from "next/image";

export function DepositButton({ onClick }: { onClick: () => void }) {
    return <button
    type="button"
    className="w-40 h-12 bg-[#0D42E4] hover:bg-[#0A2FA2] text-white font-semibold rounded-full px-4 py-3 text-sm flex items-center justify-center gap-2 transition"
    onClick={onClick}
>
    <Image src="/plus-icon-white.svg" alt="Add" width={24} height={24} /> Deposit
</button>
}