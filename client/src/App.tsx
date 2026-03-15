import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Pages
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import PlayerDetail from "./pages/PlayerDetail";
import MockDrafts from "./pages/MockDrafts";
import BigBoards from "./pages/BigBoards";
import Sources from "./pages/Sources";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/players" component={Players} />
      <Route path="/players/:id" component={PlayerDetail} />
      <Route path="/big-boards" component={BigBoards} />
      <Route path="/mock-drafts" component={MockDrafts} />
      <Route path="/sources">
        {() => <Layout><Sources /></Layout>}
      </Route>
      <Route path="/pipeline" component={MockDrafts} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
