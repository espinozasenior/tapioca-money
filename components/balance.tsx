import { useBalance } from "../hooks/useBalance";

export function WalletBalance() {
    const { usdcBalance, formatBalance } = useBalance();
    return (
        <div className="flex flex-col items-start w-full md:w-auto mb-6 md:mb-0">
            <span className="text-gray-500 text-base mb-1">Your balance</span>
            <span className="text-4xl font-semibold">
                ${formatBalance(usdcBalance)}
            </span>
        </div>
    );
} 