import clsx from "clsx";
import React, { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  showBackButton?: boolean;
  onBack?: () => void;
  className?: string;
}

export function Modal({ open, onClose, children, showBackButton, onBack, className }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className={clsx("bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative flex flex-col items-center", className)}>
        {showBackButton && (
          <button
            onClick={onBack || onClose}
            className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
            aria-label="Back"
            type="button"
          >
            <span className="text-2xl">←</span>
          </button>
        )}
        {children}
      </div>
    </div>
  );
} 