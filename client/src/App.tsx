import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Component, type ReactNode } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message + '\n' + e.stack }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', color: '#ff4444', background: '#0d1117', minHeight: '100vh' }}>
          <h2 style={{ color: '#fff' }}>Render Error (debug)</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Pages
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import PlayerDetail from "./pages/PlayerDetail";
import MockDrafts from "./pages/MockDrafts";
import BigBoards from "./pages/BigBoards";
import Sources from "./pages/Sources";
import Accuracy from "./pages/Accuracy";
import Admin from "./pages/Admin";
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
      <Route path="/accuracy" component={Accuracy} />
      <Route path="/sources">
        {() => <Layout><Sources /></Layout>}
      </Route>
      <Route path="/admin" component={Admin} />
      <Route path="/pipeline" component={MockDrafts} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
