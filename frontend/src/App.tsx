import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { loadApiConfig } from "./config";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { NotificationContainer } from "./components/NotificationContainer";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/AdminDashboard";
import TraderDashboard from "./pages/TraderDashboard";
import BrokerOrdersPage from "./pages/BrokerOrdersPage";

import SettingsPage from "./pages/SettingsPage";
import StrategiesPage from "./pages/StrategiesPage";
import OrdersPage from "./pages/OrdersPage";
import ApiConfigPage from "./pages/ApiConfigPage";
import DatabaseMgmt from "./pages/DatabaseManagementPage";
import MarketDataPage from "./pages/MarketDataPage";
import BacktestingPage from "./pages/BacktestingPage";
import UsersPage from "./pages/UsersPage";
import OptionsPage from "./pages/OptionsPage";
import StocksPage from "./pages/StocksPage";
import LoginPage from "./pages/LoginPage";
import DataLakePage from "./pages/DataLakePage";
import BacktestViewRouter from "./backtest/BacktestViewRouter";
import { API_CONFIG } from "./config";

function Router() {
  useEffect(() => {
    loadApiConfig();
  }, []);

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={AdminDashboard} />

      <Route path="/admin/settings" component={SettingsPage} />
      <Route path="/admin/api-config" component={ApiConfigPage} />
      <Route path="/admin/db-management" component={DatabaseMgmt} />
      <Route path="/admin/users" component={UsersPage} />
      <Route path="/admin/data-lake" component={DataLakePage} />
      <Route path="/trader" component={TraderDashboard} />
      <Route path="/trader/strategies" component={StrategiesPage} />
      <Route path="/trader/orders" component={OrdersPage} />
      <Route path="/trader/backtest/:projectType/:projectId" component={BacktestViewRouter} />
      <Route path="/trader/options" component={OptionsPage} />
      <Route path="/trader/broker-orders" component={BrokerOrdersPage} />
      <Route path="/trader/stocks" component={StocksPage} />
      <Route path="/trader/market-data" component={MarketDataPage} />
      <Route path="/trader/backtesting" component={BacktestingPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthenticated(false);
    };
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

  const handleLogin = (token: string, role: string) => {
    localStorage.setItem('nautilus_token', token);
    localStorage.setItem('nautilus_role', role);
    setAuthenticated(true);
  };

  if (authenticated === null) return null;

  if (!authenticated) {
    return (
      <ErrorBoundary>
        <LoginPage onLogin={handleLogin} />
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
            <Router />
          </TooltipProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
