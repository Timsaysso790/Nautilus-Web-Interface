import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { loadApiConfig } from "./config";
import { Route, Switch, Router, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { NotificationContainer } from "./components/NotificationContainer";
import ResearchLayout from "./components/ResearchLayout";
import LiveLayout from "./components/LiveLayout";
import MainLayout from "./components/MainLayout";

import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import ResearchLanding from "./pages/ResearchLanding";
import ResearchWorkspace from "./pages/ResearchWorkspace";
import OptionsLab from "./pages/OptionsLab";
import BacktestingPage from "./pages/BacktestingPage";
import PortfolioDesigner from "./pages/PortfolioDesigner";
import BacktestDetail from "./pages/BacktestDetail";
import ChartPage from "./pages/ChartPage";
import DataCatalog from "./pages/DataCatalog";
import StrategyScreener from "./pages/StrategyScreener";
import ProjectsPage from "./pages/ProjectsPage";
import AIAssistant from "./pages/AIAssistant";
import LiveLanding from "./pages/LiveLanding";
import LivePositions from "./pages/LivePositions";
import LiveOrders from "./pages/LiveOrders";
import OrderTicket from "./pages/OrderTicket";
import BrokerConnections from "./pages/BrokerConnections";
import ScannerDashboard from "./pages/ScannerDashboard";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import SettingsPage from "./pages/SettingsPage";

// Unified app layout — one sidebar, never changes
function AppPages() {
  const [location] = useLocation();

  // Determine which page to show based on path prefix
  let content;
  if (location.startsWith("/research")) {
    const page = location.replace("/research", "") || "/";
    switch (page) {
      case "/":
      case "":
        content = <ResearchLanding />; break;
      case "/options-lab":
      case "/backtesting":
      case "/portfolio-designer":
      case "/projects":
      case "/backtest-visualizer":
        content = <ResearchWorkspace />; break;
      case "/data-catalog":
        content = <DataCatalog />; break;
      case "/chart":
        content = <ChartPage />; break;
      case "/screener":
        content = <StrategyScreener />; break;
      case "/ai-assistant":
        content = <AIAssistant />; break;
      default:
        content = <NotFound />;
    }
  } else if (location.startsWith("/live")) {
    const page = location.replace("/live", "") || "/";
    switch (page) {
      case "/":
      case "":
        content = <LiveLanding />; break;
      case "/positions":
        content = <LivePositions />; break;
      case "/orders":
        content = <LiveOrders />; break;
      case "/order-ticket":
        content = <OrderTicket />; break;
      case "/brokers":
        content = <BrokerConnections />; break;
      case "/scanner":
        content = <ScannerDashboard />; break;
      default:
        content = <NotFound />;
    }
  } else {
    content = <NotFound />;
  }

  return <MainLayout>{content}</MainLayout>;
}

function RouterOutlet() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/research" component={AppPages} />
      <Route path="/research/:rest*" component={AppPages} />
      <Route path="/live" component={AppPages} />
      <Route path="/live/:rest*" component={AppPages} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const onUnauthorized = () => setAuthenticated(false);
    window.addEventListener('nautilus:unauthorized', onUnauthorized);
    return () => window.removeEventListener('nautilus:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('nautilus_token');
    if (!token) {
      setAuthenticated(false);
      return;
    }
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Malformed token');
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      const exp = typeof payload.exp === 'number' ? payload.exp : null;
      if (exp !== null && exp * 1000 < Date.now()) {
        localStorage.removeItem('nautilus_token');
        localStorage.removeItem('nautilus_role');
        setAuthenticated(false);
      } else {
        setAuthenticated(true);
      }
    } catch {
      localStorage.removeItem('nautilus_token');
      localStorage.removeItem('nautilus_role');
      setAuthenticated(false);
    }
  }, []);

  if (authenticated === null) return null;

  if (!authenticated) {
    return (
      <ErrorBoundary>
        <LoginPage onLogin={(token, role) => {
          localStorage.setItem('nautilus_token', token);
          localStorage.setItem('nautilus_role', role);
          setAuthenticated(true);
        }} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NotificationProvider>
          <TooltipProvider>
            <Toaster />
            <NotificationContainer />
            <RouterOutlet />
          </TooltipProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
