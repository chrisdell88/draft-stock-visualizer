import { Link, useLocation } from "wouter";
import { Activity, Users, LayoutDashboard, TrendingUp, Radio, Award, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

export default function Sidebar() {
  const [location] = useLocation();
  const { data: recentActivity = [] } = useQuery<{ publishedAt: string | null }[]>({
    queryKey: ["/api/activity/sidebar-latest"],
    queryFn: () => fetch("/api/activity?limit=1").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const lastUpdatedAt = recentActivity[0]?.publishedAt ?? null;
  const lastUpdatedLabel = lastUpdatedAt ? format(new Date(lastUpdatedAt), "MMM d, h:mm a") : null;

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/players", label: "Prospects", icon: Users },
    { href: "/big-boards", label: "Big Boards", icon: Award },
    { href: "/mock-drafts", label: "Mock Drafts", icon: Activity },
    { href: "/accuracy", label: "Analyst X Score", icon: BarChart2 },
    { href: "/sources", label: "Sources & Scrapers", icon: Radio },
  ];

  return (
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
        {links.map((link) => {
          const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
          const Icon = link.icon;

          return (
            <Link key={link.href} href={link.href} className="block relative">
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
      </nav>

      <div className="p-6 border-t border-white/5 text-xs font-mono text-muted-foreground">
        <p className="text-[10px] text-white/25">2026 NFL Draft · Apr 24</p>
        {lastUpdatedLabel && (
          <p className="text-[10px] text-white/20 mt-0.5">Updated {lastUpdatedLabel}</p>
        )}
      </div>
    </div>
  );
}
