export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="mt-8 w-full rounded-full bg-green-400 py-3 text-lg font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
