"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "nav";

interface PillButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: Variant;
  href?: string;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-[var(--pearl)] text-[var(--matcha)] px-14 py-6 text-xl font-extrabold shadow-xl",
  secondary:
    "bg-white text-[var(--pearl)] border-4 border-[var(--pearl)] px-14 py-6 text-xl font-extrabold hover:bg-[var(--creamy)]",
  nav:
    "bg-[var(--pearl)] text-[var(--matcha)] px-8 py-3 text-sm font-bold shadow-lg",
};

export function PillButton({
  variant = "primary",
  className,
  href,
  children,
  ...props
}: PillButtonProps) {
  const classes = cn("pill-button", variantStyles[variant], className);

  if (href) {
    return (
      <motion.a
        href={href}
        className={classes}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      className={classes}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      {...(props as ComponentPropsWithoutRef<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
}
