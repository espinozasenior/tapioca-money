interface BreakdownElementProps {
	label: string;
	value: string | number;
	isLoading?: boolean;
}

function BreakdownElement({ label, value, isLoading }: BreakdownElementProps) {
	return (
		<div className="flex justify-between text-[#64748B]">
			<span className="text-[#64748B]">{label}</span>
			<span className="text-[#334155] flex items-center">
				{isLoading ? <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin border-[#0D42E4]" />
					: `$ ${typeof value === 'number' ? value.toFixed(2) : value}`}
			</span>
		</div>
	);
}

interface AmountBreakdownProps {
	quote?: {
		status: "valid" | "item-unavailable" | "expired" | "requires-recipient";
		quantityRange?: {
			lowerBound: string;
			upperBound: string;
		}
		totalPrice?: {
			currency: string;
			amount: string;
		};
	};
	inputAmount: number;
	isAmountValid: boolean;
}

export function AmountBreakdown({ quote, inputAmount, isAmountValid }: AmountBreakdownProps) {
	const amount = quote?.totalPrice?.amount && isAmountValid ? Number.parseFloat(quote?.totalPrice?.amount) : 0
	const total = amount && quote?.quantityRange?.upperBound && isAmountValid
		? Number.parseFloat(quote?.quantityRange?.upperBound)
		: 0;
	const fees = amount ? amount - total : 0;

	const isLoading = inputAmount !== amount && isAmountValid;

	return (
		<div className="text-base p-4 w-full gap-[18px] flex flex-col font-semibold bg-[#F8FAFC] rounded-2xl">
			<BreakdownElement label="Amount" value={amount} isLoading={isLoading} />
			<BreakdownElement label="Transaction fees" value={fees} isLoading={isLoading} />
			<BreakdownElement label="Total added to wallet" value={total} isLoading={isLoading} />
		</div>
	);
}
