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
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex items-center flex-wrap text-xs font-mono list-none p-0 m-0 gap-y-1 min-w-0">
        <li className="shrink-0">
          <Link to="/" className="font-bold text-accent hover:text-accent-muted transition-colors">bottel.ai</Link>
        </li>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={i} className="contents">
              <span className="text-text-muted mx-2 shrink-0" aria-hidden="true">›</span>
              {isLast || !crumb.to ? (
                <span className="text-text-primary font-bold truncate min-w-0" aria-current="page">{crumb.label}</span>
              ) : (
                <Link to={crumb.to} className="text-text-muted hover:text-text-primary transition-colors truncate min-w-0">{crumb.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
      <div className="border-b border-border mt-2" />
    </nav>
  );
}
