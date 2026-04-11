import { Link, useLocation } from "wouter";
import { Activity, Users, LayoutDashboard, TrendingUp, Radio, Award, BarChart2, Menu, X, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/players", label: "Prospects", icon: Users },
  { href: "/big-boards", label: "Big Boards", icon: Award },
  { href: "/mock-drafts", label: "Mock Drafts", icon: Activity },
  { href: "/mockx-draft", label: "MockX Draft", icon: Trophy },
  { href: "/accuracy", label: "Analyst X Score", icon: BarChart2 },
  { href: "/sources", label: "Sources & Scrapers", icon: Radio },
];

function NavLinks({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <>
      {links.map((link) => {
        const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
        const Icon = link.icon;
        return (
          <Link key={link.href} href={link.href} className="block relative" onClick={onNavigate}>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
                isActive
                  ? "text-white"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-xl"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <Icon className={cn("w-5 h-5 relative z-10", isActive ? "text-primary" : "group-hover:text-white")} />
              <span className="font-medium text-sm relative z-10">{link.label}</span>
            </div>
          </Link>
        );
      })}
    </>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <div className="w-64 border-r border-white/5 bg-card/50 backdrop-blur-md flex flex-col h-screen sticky top-0 hidden md:flex">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="bg-primary/20 p-2 rounded-lg text-primary">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl leading-tight text-white tracking-tight">
              MOCK<span className="text-primary">X</span>
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Terminal v1.0</p>
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          <NavLinks location={location} />
        </nav>

        <div className="p-6 border-t border-white/5 text-xs font-mono text-muted-foreground">
          <p className="text-[10px] text-white/25">2026 NFL Draft · Apr 24</p>
        </div>
      </div>

      {/* ── Mobile Header ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-card/90 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="bg-primary/20 p-1.5 rounded-lg text-primary">
            <TrendingUp className="w-4 h-4" />
          </div>
          <h1 className="font-display font-bold text-lg text-white tracking-tight">
            MOCK<span className="text-primary">X</span>
          </h1>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* ── Mobile Nav Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-card border-r border-white/10 flex flex-col"
            >
              <div className="p-5 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/20 p-1.5 rounded-lg text-primary">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <h1 className="font-display font-bold text-lg text-white tracking-tight">
                    MOCK<span className="text-primary">X</span>
                  </h1>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                <NavLinks location={location} onNavigate={() => setMobileOpen(false)} />
              </nav>

              <div className="p-5 border-t border-white/5">
                <p className="text-[10px] text-white/25 font-mono">2026 NFL Draft · Apr 24</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
