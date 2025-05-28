interface RecipientInputProps {
	recipient: string;
	onChange: (recipient: string) => void;
}

export function RecipientInput({ recipient, onChange }: RecipientInputProps) {
	return 	<input
    type="email"
    placeholder="Enter recipient email or wallet address"
    className="mt-2 px-3 py-2 border rounded-md text-sm w-full"
    value={recipient}
    onChange={(e) => onChange(e.target.value)}
    />
}