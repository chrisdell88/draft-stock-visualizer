import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowUpDown, RefreshCw, CheckCircle2, AlertCircle, Clock, Wifi, WifiOff,
  TrendingUp, Users, Database, ExternalLink, Play, BarChart3, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type Analyst = {
  id: number;
  name: string;
  outlet: string;
  huddleScore2025: number | null;
  huddleScore5Year: string | null;
  accuracyWeight: string | null;
  isConsensus: number | null;
  sourceKey: string | null;
  scrapeUrl: string | null;
  notes: string | null;
};

type ScrapeJob = {
  id: number;
  sourceKey: string;
  lastRunAt: string | null;
  status: string | null;
  picksFound: number | null;
  errorMessage: string | null;
};

type ScrapeStatus = {
  jobs: ScrapeJob[];
  scrapers: Array<{ sourceKey: string; displayName: string; job: ScrapeJob | null }>;
  totalSources: number;
  scrapableSources: number;
};

const SORT_OPTIONS = ["weight", "name", "score2025", "score5yr"] as const;
type SortKey = typeof SORT_OPTIONS[number];

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "pending") {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />Pending</span>;
  }
  if (status === "running") {
    return <span className="inline-flex items-center gap-1 text-xs text-blue-400"><RefreshCw className="w-3 h-3 animate-spin" />Running</span>;
  }
  if (status === "success") {
    return <span className="inline-flex items-center gap-1 text-xs text-stock-up"><CheckCircle2 className="w-3 h-3" />Success</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs text-stock-down"><AlertCircle className="w-3 h-3" />Error</span>;
}

function WeightBar({ weight }: { weight: number }) {
  const pct = Math.round(weight * 100);
  const color = pct >= 90 ? "bg-stock-up" : pct >= 80 ? "bg-primary" : pct >= 70 ? "bg-yellow-500" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground font-mono">{(weight).toFixed(2)}</span>
    </div>
  );
}

function ScoreChip({ score, label }: { score: number | null; label?: string }) {
  if (!score) return <span className="text-muted-foreground text-xs">—</span>;
  const color = score >= 50 ? "text-stock-up" : score >= 45 ? "text-primary" : score >= 40 ? "text-yellow-400" : "text-muted-foreground";
  return <span className={cn("font-mono font-bold text-sm", color)}>{score}{label}</span>;
}

export default function Sources() {
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<SortKey>("weight");
  const [sortDesc, setSortDesc] = useState(true);

  // Admin check
  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });
  const isAdmin = adminCheck?.isAdmin === true;

  const { data: analysts = [] } = useQuery<Analyst[]>({
    queryKey: ["/api/analysts"],
  });

  const { data: scrapeStatus } = useQuery<ScrapeStatus>({
    queryKey: ["/api/scrape/status"],
    refetchInterval: isAdmin ? 10000 : false, // only poll for admins
    enabled: isAdmin,
  });

  const scrapeAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scrape"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrape/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    },
  });

  const scrapeOneMutation = useMutation({
    mutationFn: (sourceKey: string) => apiRequest("POST", `/api/scrape/${sourceKey}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrape/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    },
  });

  const sortedAnalysts = [...analysts].sort((a, b) => {
    let av = 0, bv = 0;
    if (sortBy === "weight") {
      av = Number(a.accuracyWeight ?? 0); bv = Number(b.accuracyWeight ?? 0);
    } else if (sortBy === "name") {
      return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
    } else if (sortBy === "score2025") {
      av = a.huddleScore2025 ?? 0; bv = b.huddleScore2025 ?? 0;
    } else if (sortBy === "score5yr") {
      av = Number(a.huddleScore5Year ?? 0); bv = Number(b.huddleScore5Year ?? 0);
    }
    return sortDesc ? bv - av : av - bv;
  });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDesc(d => !d);
    else { setSortBy(key); setSortDesc(true); }
  };

  const scrapableAnalysts = analysts.filter(a => a.sourceKey);
  const consensusAnalysts = analysts.filter(a => a.isConsensus);
  const individualAnalysts = analysts.filter(a => !a.isConsensus);

  const getJobForAnalyst = (a: Analyst) => {
    return scrapeStatus?.jobs.find(j => j.sourceKey === a.sourceKey) ?? null;
  };

  const isScrapable = (a: Analyst) =>
    a.sourceKey != null && (scrapeStatus?.scrapers.some(s => s.sourceKey === a.sourceKey) ?? false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Sources <span className="text-primary">&amp;</span> Analysts
          </h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Tracking {analysts.length} sources · {scrapableAnalysts.length} auto-scrapable · Updated daily at 6:00 AM ET
          </p>
        </div>
        {isAdmin ? (
          <Button
            data-testid="button-scrape-all"
            onClick={() => scrapeAllMutation.mutate()}
            disabled={scrapeAllMutation.isPending}
            className="bg-primary hover:bg-primary/80 text-black font-semibold gap-2"
          >
            {scrapeAllMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />Running Scrapers…</>
            ) : (
              <><Play className="w-4 h-4" />Run All Scrapers</>
            )}
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-white/30 font-mono">
            <Lock className="w-3 h-3" />
            Updated daily at 6:00 AM ET
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Sources", value: analysts.length, icon: Users, color: "text-primary" },
          { label: "Auto-Scraped", value: scrapableAnalysts.length, icon: Wifi, color: "text-stock-up" },
          { label: "Consensus Models", value: consensusAnalysts.length, icon: BarChart3, color: "text-blue-400" },
          { label: "Individual Analysts", value: individualAnalysts.length, icon: TrendingUp, color: "text-yellow-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card/50 border border-white/5 rounded-xl p-4 flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-white/5", color)}><Icon className="w-4 h-4" /></div>
            <div>
              <p className={cn("text-xl font-bold font-mono", color)}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Scraper Status Cards — admin only */}
      {isAdmin && scrapeStatus && scrapeStatus.scrapers.length > 0 && (
        <div>
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground font-mono mb-3 flex items-center gap-2">
            <Wifi className="w-3 h-3 text-stock-up" />Auto-Scrapers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scrapeStatus.scrapers.map(({ sourceKey, displayName, job }) => (
              <motion.div
                key={sourceKey}
                whileHover={{ scale: 1.01 }}
                className="bg-card/50 border border-white/5 rounded-xl p-4 flex items-center justify-between gap-3"
                data-testid={`scraper-card-${sourceKey}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <StatusBadge status={job?.status ?? "pending"} />
                    {job?.lastRunAt && (
                      <span className="text-xs text-muted-foreground font-mono">
                        Last: {new Date(job.lastRunAt).toLocaleDateString()}
                      </span>
                    )}
                    {job?.picksFound != null && job.picksFound > 0 && (
                      <span className="text-xs text-primary font-mono">{job.picksFound} picks</span>
                    )}
                  </div>
                  {job?.errorMessage && (
                    <p className="text-xs text-stock-down mt-1 truncate">{job.errorMessage}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/10 hover:border-primary hover:text-primary shrink-0 gap-1 text-xs"
                  disabled={scrapeOneMutation.isPending}
                  onClick={() => scrapeOneMutation.mutate(sourceKey)}
                  data-testid={`button-scrape-${sourceKey}`}
                >
                  <RefreshCw className={cn("w-3 h-3", scrapeOneMutation.isPending && "animate-spin")} />
                  Scrape
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Main leaderboard table */}
      <Tabs defaultValue="all">
        <TabsList className="bg-card/50 border border-white/5">
          <TabsTrigger value="all" data-testid="tab-all">All Sources ({analysts.length})</TabsTrigger>
          <TabsTrigger value="individual" data-testid="tab-individual">Individual ({individualAnalysts.length})</TabsTrigger>
          <TabsTrigger value="consensus" data-testid="tab-consensus">Consensus ({consensusAnalysts.length})</TabsTrigger>
        </TabsList>

        {(["all", "individual", "consensus"] as const).map(tab => {
          const filtered = tab === "all" ? sortedAnalysts
            : tab === "individual" ? sortedAnalysts.filter(a => !a.isConsensus)
            : sortedAnalysts.filter(a => a.isConsensus);

          return (
            <TabsContent key={tab} value={tab} className="mt-4">
              <div className="bg-card/50 border border-white/5 rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-muted-foreground font-mono text-xs uppercase w-8">#</TableHead>
                      <TableHead>
                        <button className="flex items-center gap-1 text-muted-foreground font-mono text-xs uppercase hover:text-white" onClick={() => toggleSort("name")}>
                          Analyst <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </TableHead>
                      <TableHead className="hidden md:table-cell text-muted-foreground font-mono text-xs uppercase">Outlet</TableHead>
                      <TableHead>
                        <button className="flex items-center gap-1 text-muted-foreground font-mono text-xs uppercase hover:text-white" onClick={() => toggleSort("score2025")}>
                          2025 Score <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        <button className="flex items-center gap-1 text-muted-foreground font-mono text-xs uppercase hover:text-white" onClick={() => toggleSort("score5yr")}>
                          5-Yr Avg <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button className="flex items-center gap-1 text-muted-foreground font-mono text-xs uppercase hover:text-white" onClick={() => toggleSort("weight")}>
                          Weight <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </TableHead>
                      <TableHead className="hidden lg:table-cell text-muted-foreground font-mono text-xs uppercase">Status</TableHead>
                      <TableHead className="hidden lg:table-cell text-muted-foreground font-mono text-xs uppercase">Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((analyst, idx) => {
                      const job = getJobForAnalyst(analyst);
                      const scrapable = isScrapable(analyst);
                      return (
                        <TableRow
                          key={analyst.id}
                          className="border-white/5 hover:bg-white/2"
                          data-testid={`analyst-row-${analyst.id}`}
                        >
                          <TableCell className="text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-semibold text-white leading-tight">{analyst.name}</p>
                              {analyst.notes && (
                                <p className="text-xs text-muted-foreground leading-snug line-clamp-1 mt-0.5 hidden lg:block">{analyst.notes}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-xs text-muted-foreground">{analyst.outlet}</span>
                          </TableCell>
                          <TableCell>
                            <ScoreChip score={analyst.huddleScore2025} />
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <ScoreChip score={analyst.huddleScore5Year ? Number(analyst.huddleScore5Year) : null} />
                          </TableCell>
                          <TableCell>
                            <WeightBar weight={Number(analyst.accuracyWeight ?? 0)} />
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {scrapable ? (
                              <StatusBadge status={job?.status ?? "pending"} />
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <WifiOff className="w-3 h-3" />Manual
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {analyst.isConsensus ? (
                              <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400 bg-blue-500/10">
                                Consensus
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">
                                Individual
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Methodology note */}
      <div className="bg-card/30 border border-white/5 rounded-xl p-5 text-sm text-muted-foreground space-y-2">
        <p className="text-white font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />Methodology
        </p>
        <p>Accuracy weights are derived from the Huddle Report's annual mock draft scorecard, which tracks correct picks (player + position + team + round) across the full first round. Higher scores indicate more historically accurate analysts.</p>
        <p>Consensus sources (GTM, MDDB, Tankathon) aggregate 500–1,500+ individual mock drafts and are weighted highest. Auto-scraped sources are updated daily at 6:00 AM ET.</p>
        <p className="flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Source: <a href="https://huddlereport.com" className="text-primary hover:underline ml-1">huddlereport.com</a>
        </p>
      </div>
    </div>
  );
}
