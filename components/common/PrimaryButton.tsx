export function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`bg-primary hover:bg-primary-hover text-primary-foreground mt-8 w-full rounded-full py-3 text-lg font-semibold transition disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400${className ? ` ${className}` : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
