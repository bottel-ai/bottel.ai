interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "accent";
  className?: string;
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default:
    "text-text-secondary border border-border",
  success: "text-success border border-success/30",
  accent: "text-accent",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium font-mono ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
