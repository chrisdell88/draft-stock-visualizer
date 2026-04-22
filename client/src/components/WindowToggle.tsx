import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdpWindow, ADP_WINDOWS, type AdpWindow } from "@/hooks/use-adp-window";

interface WindowToggleProps {
  className?: string;
  /** If true, show "ADP window:" label alongside the tabs. Default true. */
  showLabel?: boolean;
  compact?: boolean;
}

/**
 * Segmented control for the global ADP time-window selector.
 * Render anywhere — state is global via AdpWindowContext.
 */
export function WindowToggle({ className, showLabel = true, compact = false }: WindowToggleProps) {
  const { window, setWindow } = useAdpWindow();
  return (
    <div className={cn("flex items-center gap-2", className)} data-testid="adp-window-toggle">
      {showLabel && !compact && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>ADP window</span>
        </div>
      )}
      <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
        {ADP_WINDOWS.map((w) => {
          const active = w.value === window;
          return (
            <button
              key={w.value}
              type="button"
              onClick={() => setWindow(w.value)}
              title={w.full}
              aria-pressed={active}
              data-testid={`adp-window-${w.value}`}
              className={cn(
                "px-2.5 py-1 rounded font-mono font-bold transition-all text-xs",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {w.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { AdpWindow };
