import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function Button({ children, icon, variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...props}>{icon && <Icon name={icon} size={16} />}{children}</button>;
}
export function IconButton({ icon, label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}><Icon name={icon} size={16} /></button>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}
export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="actions">{actions}</div>}</div>;
}
export function EmptyState({ title, description, icon = "search", children }: { title: string; description: string; icon?: IconName; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={26} /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={`modal ${wide ? "modal-wide" : ""}`}><div className="modal-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><IconButton icon="x" label="Cerrar diálogo" onClick={onClose} /></div>{children}</div></div>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Tabs({ items, active, onChange }: { items: { id: string; label: string; count?: number; icon?: IconName }[]; active: string; onChange: (id: string) => void }) {
  return <div className="tabs" aria-label="Secciones">{items.map(item => <button type="button" key={item.id} className={active === item.id ? "active" : ""} aria-pressed={active === item.id} onClick={() => onChange(item.id)}>{item.icon && <Icon name={item.icon} size={15} />}{item.label}{item.count !== undefined && <span className="count">{item.count}</span>}</button>)}</div>;
}
export function downloadText(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
