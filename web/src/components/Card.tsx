interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className = "", onClick, hover }: CardProps) {
  const base = "bg-bg-card border border-border rounded-lg";
  const hoverStyles =
    hover || onClick
      ? "hover:bg-bg-elevated transition-colors cursor-pointer"
      : "";
  const classes = `${base} ${hoverStyles} ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${classes} text-left w-full`}
      >
        {children}
      </button>
    );
  }

  return <div className={classes}>{children}</div>;
}
