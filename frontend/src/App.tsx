import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { loadApiConfig } from "./config";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { NotificationContainer } from "./components/NotificationContainer";
import ResearchLayout from "./components/ResearchLayout";
import LiveLayout from "./components/LiveLayout";

import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import ResearchLanding from "./pages/ResearchLanding";
import ResearchWorkspace from "./pages/ResearchWorkspace";
import DataCatalog from "./pages/DataCatalog";
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

// Single catch-all — picks the right layout based on path prefix
function AppPages() {
  const [location] = useLocation();

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
      case "/ai-assistant":
        content = <AIAssistant />; break;
      default:
        content = <NotFound />;
    }
    return <ResearchLayout>{content}</ResearchLayout>;
  }

  if (location.startsWith("/live")) {
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
    return <LiveLayout>{content}</LiveLayout>;
  }

  return <NotFound />;
}

function RouterOutlet() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin/settings" component={SettingsPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route component={AppPages} />
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
