import { useNavigate, useLocation, Link } from "react-router-dom";
import { Home, Film, Users, ClipboardList, BarChart3, Settings, Sun, Moon, ArrowLeft, Menu, X, Sparkles } from "lucide-react";
import { useState } from "react";
import { AvaLogo } from "./AvaLogo";
import { useTheme } from "../context/ThemeContext";
import { cn } from "../lib/utils";

const NAV = [
  { to: "/", label: "Início", icon: Home, testid: "nav-home" },
  { to: "/galeria", label: "Galeria", icon: Film, testid: "nav-gallery" },
  { to: "/atletas", label: "Atletas", icon: Users, testid: "nav-athletes" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, testid: "nav-reports" },
  { to: "/ia", label: "IA", icon: Sparkles, testid: "nav-ai" },
  { to: "/configuracoes", label: "Config", icon: Settings, testid: "nav-settings" },
];

export const Layout = ({ children, title, subtitle, back, actions }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const isActive = (to) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 flex h-16 items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" data-testid="brand-logo">
            <AvaLogo size={38} />
            <div className="hidden sm:block leading-none">
              <div className="ava-heading text-xl font-extrabold tracking-tight">AVA</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Vôlei Analytics</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-4">
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  data-testid={n.testid}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(n.to)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Icon size={16} />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggle}
              data-testid="theme-toggle"
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              data-testid="mobile-menu-toggle"
              className="md:hidden rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
              aria-label="Menu"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-2 flex flex-col gap-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  data-testid={`${n.testid}-mobile`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                    isActive(n.to) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <Icon size={18} /> {n.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <main className="flex-1 w-full">
        {(title || back) && (
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-6 pb-2">
            <div className="flex flex-wrap items-center gap-3">
              {back && (
                <button
                  onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
                  data-testid="back-button"
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <ArrowLeft size={16} /> Voltar
                </button>
              )}
              <div className="min-w-0">
                {title && <h1 className="ava-heading text-3xl sm:text-4xl font-extrabold leading-none">{title}</h1>}
                {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
              </div>
              {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
            </div>
          </div>
        )}
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">{children}</div>
      </main>
    </div>
  );
};
