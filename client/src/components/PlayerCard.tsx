import { Link } from "wouter";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerCardProps {
  player: {
    id: number;
    name: string;
    position: string | null;
    college: string | null;
    currentAdp?: number;
    trend?: 'up' | 'down' | 'flat';
    imageUrl?: string | null;
  };
  index: number;
}

export function PlayerCard({ player, index }: PlayerCardProps) {
  const isUp = player.trend === 'up';
  const isDown = player.trend === 'down';
  const isFlat = !isUp && !isDown;

  return (
    <Link href={`/players/${player.id}`} className="block">
      <div 
        className="glass-card p-5 rounded-2xl cursor-pointer group hover:-translate-y-1 hover:shadow-primary/10 transition-all duration-300 relative overflow-hidden"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-transparent via-primary to-transparent" />
        
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-display font-bold text-white group-hover:text-primary transition-colors">
              {player.name}
            </h3>
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded bg-white/5 font-mono text-xs">{player.position || 'UNK'}</span>
              <span>{player.college}</span>
            </p>
          </div>
          
          {player.imageUrl ? (
            <img src={player.imageUrl} alt={player.name} className="w-12 h-12 rounded-full object-cover border-2 border-white/10" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-muted-foreground/50" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            </div>
          )}
        </div>

        <div className="flex items-end justify-between mt-6">
          <div>
            <p className="text-xs text-muted-foreground font-mono mb-1 uppercase tracking-wider">Current ADP</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-white leading-none">
                {player.currentAdp ? player.currentAdp.toFixed(1) : '---'}
              </span>
            </div>
          </div>
          
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-sm border",
            isUp ? "text-[hsl(var(--stock-up))] bg-[hsl(var(--stock-up))]/10 border-[hsl(var(--stock-up))]/20" : 
            isDown ? "text-[hsl(var(--stock-down))] bg-[hsl(var(--stock-down))]/10 border-[hsl(var(--stock-down))]/20" : 
            "text-muted-foreground bg-white/5 border-white/10"
          )}>
            {isUp && <TrendingUp className="w-4 h-4" />}
            {isDown && <TrendingDown className="w-4 h-4" />}
            {isFlat && <Minus className="w-4 h-4" />}
            <span>{isUp ? 'RISING' : isDown ? 'FALLING' : 'STABLE'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
