import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Lock, LogOut, Play, RefreshCw, Plus, Search, Save, Users, FileText, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import type { Analyst, Player, ScrapeJob, ScrapeRun } from "@shared/schema";

interface AnalystWithJob extends Analyst {
  scrapeJob: ScrapeJob | null;
  totalPicks: number;
}

interface AnalystUpdateData {
  scrapeUrl?: string;
  accuracyWeight?: number;
  enabled?: number;
}

interface PlayerUpdateData {
  position?: string;
  college?: string;
  imageUrl?: string;
}

function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/login", { password });
    },
    onSuccess: () => {
      toast({ title: "Logged in" });
      onLogin();
    },
    onError: () => {
      setError("Invalid password");
    },
  });

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-white flex items-center justify-center gap-2">
            <Lock className="w-5 h-5 text-emerald-500" />
            DraftX Admin
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loginMutation.mutate();
            }}
            className="space-y-4"
          >
            <Input
              data-testid="input-admin-password"
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button
              data-testid="button-admin-login"
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge variant="outline" className="text-zinc-500 border-zinc-700">None</Badge>;
  const colors: Record<string, string> = {
    success: "bg-emerald-900/50 text-emerald-400 border-emerald-800",
    error: "bg-red-900/50 text-red-400 border-red-800",
    running: "bg-blue-900/50 text-blue-400 border-blue-800",
    pending: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  };
  return (
    <Badge variant="outline" className={colors[status] ?? "text-zinc-500 border-zinc-700"}>
      {status}
    </Badge>
  );
}

function SourcesTab() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: analysts, isLoading } = useQuery<AnalystWithJob[]>({
    queryKey: ["/api/admin/analysts"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AnalystUpdateData }) => {
      await apiRequest("PATCH", `/api/admin/analysts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analysts"] });
      setEditingId(null);
      toast({ title: "Analyst updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/admin/analysts/${id}`, { enabled: enabled ? 1 : 0 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analysts"] });
      toast({ title: "Analyst toggled" });
    },
    onError: (err: Error) => {
      toast({ title: "Toggle failed", description: err.message, variant: "destructive" });
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: async (sourceKey: string) => {
      const res = await apiRequest("POST", `/api/admin/scrape/${sourceKey}`);
      return res.json();
    },
    onSuccess: (data: { result?: { picksFound?: number } }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analysts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scrape-logs"] });
      toast({ title: "Scrape completed", description: `${data?.result?.picksFound ?? 0} picks found` });
    },
    onError: (err: Error) => {
      toast({ title: "Scrape failed", description: err.message, variant: "destructive" });
    },
  });

  const scrapeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/scrape-all");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analysts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scrape-logs"] });
      toast({ title: "All scrapers completed" });
    },
    onError: (err: Error) => {
      toast({ title: "Scrape all failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = (analysts ?? []).filter((a: AnalystWithJob) =>
    !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.sourceKey ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            data-testid="input-search-analysts"
            placeholder="Search analysts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
        <Button
          data-testid="button-scrape-all"
          onClick={() => scrapeAllMutation.mutate()}
          disabled={scrapeAllMutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${scrapeAllMutation.isPending ? "animate-spin" : ""}`} />
          {scrapeAllMutation.isPending ? "Scraping..." : "Run All Scrapers"}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-8">Loading analysts...</div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-zinc-900">
                <TableHead className="text-zinc-400">Enabled</TableHead>
                <TableHead className="text-zinc-400">Name</TableHead>
                <TableHead className="text-zinc-400">Source Key</TableHead>
                <TableHead className="text-zinc-400">Type</TableHead>
                <TableHead className="text-zinc-400">Weight</TableHead>
                <TableHead className="text-zinc-400">Picks</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Last Scrape</TableHead>
                <TableHead className="text-zinc-400">URL</TableHead>
                <TableHead className="text-zinc-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a: AnalystWithJob) => (
                <TableRow
                  key={a.id}
                  className={`border-zinc-800 hover:bg-zinc-900/50 ${a.enabled === 0 ? "opacity-50" : ""}`}
                  data-testid={`row-analyst-${a.id}`}
                >
                  <TableCell>
                    <Switch
                      data-testid={`toggle-analyst-${a.id}`}
                      checked={a.enabled !== 0}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: a.id, enabled: checked })}
                      disabled={toggleMutation.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-white font-medium">{a.name}</TableCell>
                  <TableCell className="text-zinc-400 font-mono text-xs">{a.sourceKey ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-zinc-400 border-zinc-700 text-xs">
                      {a.boardType === "bigboard" ? "Big Board" : "Mock"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editingId === a.id ? (
                      <Input
                        data-testid={`input-weight-${a.id}`}
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        className="w-16 h-7 text-xs bg-zinc-800 border-zinc-700 text-white"
                      />
                    ) : (
                      <span className="text-zinc-300">{a.accuracyWeight ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-300">{a.totalPicks}</TableCell>
                  <TableCell>
                    <StatusBadge status={a.scrapeJob?.status} />
                  </TableCell>
                  <TableCell className="text-zinc-500 text-xs">
                    {a.scrapeJob?.lastRunAt
                      ? new Date(a.scrapeJob.lastRunAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {editingId === a.id ? (
                      <Input
                        data-testid={`input-url-${a.id}`}
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        placeholder="Scrape URL"
                        className="w-48 h-7 text-xs bg-zinc-800 border-zinc-700 text-white"
                      />
                    ) : (
                      <span className="text-zinc-500 text-xs truncate max-w-[200px] block">
                        {a.scrapeUrl ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {editingId === a.id ? (
                        <Button
                          data-testid={`button-save-${a.id}`}
                          size="sm"
                          variant="ghost"
                          className="h-7 text-emerald-400 hover:text-emerald-300"
                          onClick={() => {
                            const data: AnalystUpdateData = {};
                            if (editUrl !== (a.scrapeUrl ?? "")) data.scrapeUrl = editUrl;
                            if (editWeight !== String(a.accuracyWeight ?? "")) data.accuracyWeight = parseFloat(editWeight) || undefined;
                            updateMutation.mutate({ id: a.id, data });
                          }}
                        >
                          <Save className="w-3 h-3" />
                        </Button>
                      ) : (
                        <Button
                          data-testid={`button-edit-${a.id}`}
                          size="sm"
                          variant="ghost"
                          className="h-7 text-zinc-400 hover:text-white"
                          onClick={() => {
                            setEditingId(a.id);
                            setEditUrl(a.scrapeUrl ?? "");
                            setEditWeight(String(a.accuracyWeight ?? ""));
                          }}
                        >
                          <Settings className="w-3 h-3" />
                        </Button>
                      )}
                      {a.sourceKey && (
                        <Button
                          data-testid={`button-scrape-${a.sourceKey}`}
                          size="sm"
                          variant="ghost"
                          className="h-7 text-blue-400 hover:text-blue-300"
                          disabled={scrapeMutation.isPending}
                          onClick={() => scrapeMutation.mutate(a.sourceKey)}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AddAnalystForm() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [outlet, setOutlet] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [weight, setWeight] = useState("0.70");
  const [boardType, setBoardType] = useState("mock");
  const [scraperType, setScraperType] = useState("custom");

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/analysts", {
        name,
        outlet: outlet || name,
        sourceKey: sourceKey || undefined,
        scrapeUrl: scrapeUrl || undefined,
        accuracyWeight: parseFloat(weight) || 0.70,
        isConsensus: 0,
        boardType,
        scraperType,
        enabled: 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analysts"] });
      toast({ title: "Analyst added" });
      setName(""); setOutlet(""); setSourceKey(""); setScrapeUrl(""); setWeight("0.70"); setBoardType("mock"); setScraperType("custom");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create analyst", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-500" />
          Add Analyst
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <Input
            data-testid="input-new-analyst-name"
            placeholder="Display Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white"
            required
          />
          <Input
            data-testid="input-new-analyst-outlet"
            placeholder="Outlet"
            value={outlet}
            onChange={(e) => setOutlet(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
          <Input
            data-testid="input-new-analyst-key"
            placeholder="Source Key (e.g. pff_sikkema)"
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
          <Input
            data-testid="input-new-analyst-url"
            placeholder="Scrape URL"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
          <Input
            data-testid="input-new-analyst-weight"
            placeholder="Accuracy Weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white"
            type="number"
            step="0.01"
            min="0"
            max="1"
          />
          <Select value={scraperType} onValueChange={setScraperType}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="select-scraper-type">
              <SelectValue placeholder="Scraper Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nfl_article">NFL Article</SelectItem>
              <SelectItem value="walter">WalterFootball</SelectItem>
              <SelectItem value="sharp">SharpFootball</SelectItem>
              <SelectItem value="mockdraftnfl">MockDraftNFL</SelectItem>
              <SelectItem value="tankathon">Tankathon</SelectItem>
              <SelectItem value="custom">Custom URL</SelectItem>
            </SelectContent>
          </Select>
          <Select value={boardType} onValueChange={setBoardType}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="select-board-type">
              <SelectValue placeholder="Board Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock Draft</SelectItem>
              <SelectItem value="bigboard">Big Board</SelectItem>
            </SelectContent>
          </Select>
          <Button
            data-testid="button-add-analyst"
            type="submit"
            disabled={createMutation.isPending || !name}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {createMutation.isPending ? "Adding..." : "Add Analyst"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const LOGS_PER_PAGE = 15;

function LogsTab() {
  const [page, setPage] = useState(0);

  const { data: logs, isLoading } = useQuery<ScrapeRun[]>({
    queryKey: ["/api/admin/scrape-logs"],
  });

  const totalPages = Math.ceil((logs ?? []).length / LOGS_PER_PAGE);
  const paginatedLogs = (logs ?? []).slice(page * LOGS_PER_PAGE, (page + 1) * LOGS_PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="text-zinc-400 text-center py-8">Loading logs...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-zinc-900">
                <TableHead className="text-zinc-400">Source Key</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Picks</TableHead>
                <TableHead className="text-zinc-400">Last Run</TableHead>
                <TableHead className="text-zinc-400">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.map((log: ScrapeRun) => (
                <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-900/50" data-testid={`row-log-${log.id}`}>
                  <TableCell className="text-white font-mono text-xs">{log.sourceKey}</TableCell>
                  <TableCell><StatusBadge status={log.status} /></TableCell>
                  <TableCell className="text-zinc-300">{log.picksFound ?? "—"}</TableCell>
                  <TableCell className="text-zinc-500 text-xs">
                    {log.runAt ? new Date(log.runAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-red-400 text-xs max-w-[300px] truncate">
                    {log.errorMessage ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-zinc-500 text-sm">
            Page {page + 1} of {totalPages} ({(logs ?? []).length} total)
          </span>
          <div className="flex gap-2">
            <Button
              data-testid="button-logs-prev"
              variant="ghost"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="text-zinc-400 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <Button
              data-testid="button-logs-next"
              variant="ghost"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="text-zinc-400 hover:text-white"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayersTab() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{ position: string; college: string; imageUrl: string }>({
    position: "", college: "", imageUrl: "",
  });

  const { data: playerList, isLoading } = useQuery<Player[]>({
    queryKey: ["/api/admin/players"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PlayerUpdateData }) => {
      await apiRequest("PATCH", `/api/admin/players/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players"] });
      setEditingId(null);
      toast({ title: "Player updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = (playerList ?? []).filter((p: Player) =>
    !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.position ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.college ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          data-testid="input-search-players"
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-zinc-800 border-zinc-700 text-white"
        />
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-8">Loading players...</div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-zinc-900">
                <TableHead className="text-zinc-400">Name</TableHead>
                <TableHead className="text-zinc-400">Position</TableHead>
                <TableHead className="text-zinc-400">College</TableHead>
                <TableHead className="text-zinc-400">ADP</TableHead>
                <TableHead className="text-zinc-400">Image URL</TableHead>
                <TableHead className="text-zinc-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p: Player) => (
                <TableRow key={p.id} className="border-zinc-800 hover:bg-zinc-900/50" data-testid={`row-player-${p.id}`}>
                  <TableCell className="text-white font-medium">{p.name}</TableCell>
                  <TableCell>
                    {editingId === p.id ? (
                      <Input
                        data-testid={`input-position-${p.id}`}
                        value={editData.position}
                        onChange={(e) => setEditData({ ...editData, position: e.target.value })}
                        className="w-20 h-7 text-xs bg-zinc-800 border-zinc-700 text-white"
                      />
                    ) : (
                      <Badge variant="outline" className="text-zinc-300 border-zinc-700">{p.position ?? "—"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === p.id ? (
                      <Input
                        data-testid={`input-college-${p.id}`}
                        value={editData.college}
                        onChange={(e) => setEditData({ ...editData, college: e.target.value })}
                        className="w-32 h-7 text-xs bg-zinc-800 border-zinc-700 text-white"
                      />
                    ) : (
                      <span className="text-zinc-400">{p.college ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-300">{p.currentAdp?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell>
                    {editingId === p.id ? (
                      <Input
                        data-testid={`input-imageurl-${p.id}`}
                        value={editData.imageUrl}
                        onChange={(e) => setEditData({ ...editData, imageUrl: e.target.value })}
                        placeholder="Image URL"
                        className="w-48 h-7 text-xs bg-zinc-800 border-zinc-700 text-white"
                      />
                    ) : (
                      <span className="text-zinc-500 text-xs truncate max-w-[150px] block">
                        {p.imageUrl ? "Set" : "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === p.id ? (
                      <Button
                        data-testid={`button-save-player-${p.id}`}
                        size="sm"
                        variant="ghost"
                        className="h-7 text-emerald-400 hover:text-emerald-300"
                        onClick={() => {
                          updateMutation.mutate({
                            id: p.id,
                            data: {
                              position: editData.position || undefined,
                              college: editData.college || undefined,
                              imageUrl: editData.imageUrl || undefined,
                            },
                          });
                        }}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                    ) : (
                      <Button
                        data-testid={`button-edit-player-${p.id}`}
                        size="sm"
                        variant="ghost"
                        className="h-7 text-zinc-400 hover:text-white"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditData({
                            position: p.position ?? "",
                            college: p.college ?? "",
                            imageUrl: p.imageUrl ?? "",
                          });
                        }}
                      >
                        <Settings className="w-3 h-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(false);
  const { toast } = useToast();

  const authCheck = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });

  const isAuthenticated = loggedIn || authCheck.data?.isAdmin;

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/logout");
    },
    onSuccess: () => {
      setLoggedIn(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/check"] });
      toast({ title: "Logged out" });
    },
  });

  if (!isAuthenticated) {
    return <LoginGate onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-admin-title">DraftX Admin</h1>
            <p className="text-zinc-500 text-sm">Manage sources, scrapers, and player data</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-zinc-400 hover:text-white text-sm">Back to App</a>
            <Button
              data-testid="button-admin-logout"
              variant="ghost"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              className="text-zinc-400 hover:text-white"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>

        <Tabs defaultValue="sources" className="space-y-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="sources" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400" data-testid="tab-sources">
              <Users className="w-4 h-4 mr-2" />
              Sources
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400" data-testid="tab-logs">
              <FileText className="w-4 h-4 mr-2" />
              Scrape Logs
            </TabsTrigger>
            <TabsTrigger value="players" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400" data-testid="tab-players">
              <Users className="w-4 h-4 mr-2" />
              Players
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="space-y-4">
            <AddAnalystForm />
            <SourcesTab />
          </TabsContent>

          <TabsContent value="logs">
            <LogsTab />
          </TabsContent>

          <TabsContent value="players">
            <PlayersTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
