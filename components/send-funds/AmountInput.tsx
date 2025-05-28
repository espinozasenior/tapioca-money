import { useBalance } from "@/hooks/useBalance";
import React from "react";

interface AmountInputProps {
  amount: string;
  onChange: (value: string) => void;
}

export function AmountInput({ amount, onChange }: AmountInputProps) {

const { usdcBalance, formatBalance } = useBalance();

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace("$", "").replace(",", '.').replace(/[^0-9.]/g, '');
  if (value.split(".").length > 2) return;
  if (value.split(".")[1]?.length > 2) return;

  onChange(value);
}

  return (
    <div className="flex flex-col items-center justify-between w-full mb-6">
      <input
        placeholder="$0.00"
        className="text-4xl font-bold text-center border-none outline-none focus:ring-0 w-full mb-1"
        value={amount ? `$${amount}` : ""}
        onChange={handleChange}
        style={{ maxWidth: 200 }}
      />
      <div className={Number(amount) > Number(formatBalance(usdcBalance)) ? "text-red-600" : "text-gray-400"}>$ {formatBalance(usdcBalance)} balance</div>
    </div>
  );
} 