import { Link } from "react-router-dom";

interface Crumb {
  label: string;
  to?: string;
}

interface BreadcrumbProps {
  crumbs: Crumb[];
}

export function Breadcrumb({ crumbs }: BreadcrumbProps) {
  return (
    <div className="mb-2">
      <div className="flex items-center text-xs font-mono">
        <Link to="/" className="font-bold text-accent hover:text-accent-muted transition-colors">bottel.ai</Link>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} className="contents">
              <span className="text-text-muted mx-2">›</span>
              {isLast || !crumb.to ? (
                <span className="text-text-primary font-bold">{crumb.label}</span>
              ) : (
                <Link to={crumb.to} className="text-text-muted hover:text-text-primary transition-colors">{crumb.label}</Link>
              )}
            </span>
          );
        })}
      </div>
      <div className="border-b border-border mt-2" />
    </div>
  );
}
