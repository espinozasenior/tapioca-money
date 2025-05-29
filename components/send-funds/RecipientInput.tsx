interface RecipientInputProps {
  recipient: string;
  onChange: (recipient: string) => void;
}

export function RecipientInput({ recipient, onChange }: RecipientInputProps) {
  return (
    <input
      type="email"
      placeholder="Enter recipient email or wallet address"
      className="mt-2 h-12 w-full rounded-md border px-3 py-2 text-base"
      value={recipient}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
