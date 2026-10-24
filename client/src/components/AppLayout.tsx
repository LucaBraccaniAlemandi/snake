import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useWorkspace } from "../data/WorkspaceContext";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./ui";

const navigation: { path: string; label: string; icon: IconName; section?: string }[] = [
  { path: "/", label: "Resumen", icon: "dashboard", section: "WORKSPACE" },
  { path: "/tests", label: "Casos de prueba", icon: "cases" },
  { path: "/runs", label: "Ejecuciones", icon: "play" },
  { path: "/generate", label: "Generación IA", icon: "sparkles", section: "INTELIGENCIA ARTIFICIAL" },
  { path: "/chat", label: "Chat IA", icon: "chat" },
];
export function AppLayout() {
  const { data, setData } = useWorkspace();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); document.querySelector(".main-scroll")?.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  const current = [...navigation, { path: "/settings", label: "Configuración" }].find(n => n.path === "/" ? pathname === "/" : pathname.startsWith(n.path));
  useEffect(() => { document.title = `${current?.label || "Página no encontrada"} — TESTEALO`; }, [current?.label]);
  return <div className="app-shell">
    {open && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`} aria-label="Menú principal">
      <Link className="brand" to="/"><span className="brand-logo"><Icon name="flask" size={22} /></span><span>TESTEALO<span className="brand-caption">AI-powered quality</span></span></Link>
      <div className="workspace-label"><span className="workspace-avatar">D</span><div><strong>DOC24 Workspace</strong><small>Equipo de Quality Assurance</small></div></div>
      <nav>{navigation.map(n => <div key={n.path}>{n.section && <div className="nav-section-label">{n.section}</div>}<NavLink end={n.path === "/"} to={n.path} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}><Icon name={n.icon} size={18} /><span>{n.label}</span>{n.path === "/tests" && <span className="nav-count">{data.cases.length}</span>}{n.path === "/chat" && <span className="nav-new">NUEVO</span>}</NavLink></div>)}</nav>
      <div className="sidebar-bottom"><div className="demo-card"><Icon name="sparkles" size={18} /><strong>Tu próximo test empieza aquí</strong><p>Describe una idea. Conviértela en cobertura.</p><Link to="/chat">Conversar con IA <Icon name="arrow" size={14} /></Link></div><NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}><Icon name="settings" /><span>Configuración</span></NavLink><div className="user-profile"><span className="avatar">QA</span><div><strong>Equipo QA</strong><small>Workspace local · v0.1</small></div><span className="online-dot" /></div></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="breadcrumbs"><span className="mobile-menu"><IconButton icon="menu" label="Abrir menú" onClick={() => setOpen(v => !v)} aria-expanded={open} /></span><Icon name="globe" size={15} /><span>Workspace</span><Icon name="chevron" size={12} /><strong>{current?.label || "Página no encontrada"}</strong>{pathname.startsWith("/tests/") && <><Icon name="chevron" size={12} /><span>Detalle del caso</span></>}</div><div className="topbar-actions"><span className="demo-label"><span />Demo local</span><select aria-label="Entorno de trabajo" className="environment-select" value={data.preferences.environment} onChange={e => setData(d => ({ ...d, preferences: { ...d.preferences, environment: e.target.value } }))}>{["Staging", "QA", "Development", "Local"].map(v => <option key={v}>{v}</option>)}</select><span className="top-avatar">QA</span></div></header><main className={`main-scroll ${pathname === "/chat" ? "chat-scroll" : ""}`} id="main-content"><Outlet /></main></div>
  </div>;
}
