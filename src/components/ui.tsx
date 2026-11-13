import type { LucideIcon } from "lucide-react";
import { ArrowRight, Leaf, LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

export function Button({
  children,
  className = "",
  variant = "primary",
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button className={`button button-${variant} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <LoaderCircle size={18} className="spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ to, children, variant = "primary" }: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return <Link to={to} className={`button button-${variant}`}>{children}</Link>;
}

export function Badge({ children, tone = "green" }: {
  children: ReactNode;
  tone?: "green" | "amber" | "red" | "blue" | "muted";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatCard({ icon: Icon, label, value, detail }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <article className="card stat-card">
      <div className="icon-box"><Icon size={21} /></div>
      <div><p className="eyebrow">{label}</p><strong className="stat-value">{value}</strong>{detail && <p className="muted small">{detail}</p>}</div>
    </article>
  );
}

export function EmptyState({ title, text, action, to = "/map" }: {
  title: string;
  text?: string;
  action?: string;
  to?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Leaf size={26} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && <LinkButton to={to} variant="secondary">{action}<ArrowRight size={17} /></LinkButton>}
    </div>
  );
}

export function PageHeader({ label, title, description, action }: {
  label: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div><p className="kicker">{label}</p><h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}
