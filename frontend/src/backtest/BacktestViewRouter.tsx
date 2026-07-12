import { useRoute, Redirect } from "wouter";
import OptionsStationPage from "./OptionsStationPage";
import PortfolioEnginePage from "./PortfolioEnginePage";

export default function BacktestViewRouter() {
  const [, params] = useRoute("/trader/backtest/:projectType/:projectId");
  if (!params) return <Redirect to="/404" />;
  const { projectType, projectId } = params;
  const sandbox = projectId === "sandbox";

  if (projectType === "options") {
    return (
      <OptionsStationPage
        projectId={sandbox ? "" : projectId}
        sandbox={sandbox}
      />
    );
  }
  if (projectType === "portfolio") {
    return (
      <PortfolioEnginePage
        projectId={sandbox ? "" : projectId}
        sandbox={sandbox}
      />
    );
  }
  return <Redirect to="/404" />;
}
