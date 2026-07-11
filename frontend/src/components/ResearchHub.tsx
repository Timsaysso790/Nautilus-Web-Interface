import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilePlus, FolderOpen, Zap } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";
import { optionBacktestService } from "@/services/optionBacktestService";
import NewProjectTypeDialog from "./NewProjectTypeDialog";
import OpenProjectDialog from "./OpenProjectDialog";
import ProjectBrowser from "./ProjectBrowser";
import QuickBacktestView from "./QuickBacktestView";

interface Props {
  view: string | null;
  onNavigate: (view: string | null) => void;
}

export default function ResearchHub({ view, onNavigate }: Props) {
  const { success, error: notifyError } = useNotification();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showOpenProject, setShowOpenProject] = useState(false);

  const handleCreateProject = async (name: string, type: "options" | "portfolio") => {
    try {
      const res = await optionBacktestService.createProject(name, type);
      setShowNewProject(false);
      success(`Project "${name}" created`);
      const tab = type === "options" ? "options" : "portfolio";
      window.location.href = `/trader/option-backtest?tab=${tab}&project=${res.project.id}`;
    } catch (e: any) {
      notifyError(e?.detail || "Failed to create project");
    }
  };

  if (view === "projects") {
    return (
      <ProjectBrowser
        onSelect={() => onNavigate(null)}
        onCreateNew={() => setShowNewProject(true)}
      />
    );
  }

  if (view === "quick-backtest") {
    return <QuickBacktestView />;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => setShowNewProject(true)}
        >
          <CardHeader>
            <FilePlus className="w-8 h-8 text-primary mb-2" />
            <CardTitle>New Project</CardTitle>
            <CardDescription>Create a new backtesting project workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Name your project, choose a type, and start configuring your backtest.
            </p>
            <Button variant="secondary" className="w-full">Get Started</Button>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => setShowOpenProject(true)}
        >
          <CardHeader>
            <FolderOpen className="w-8 h-8 text-primary mb-2" />
            <CardTitle>Open Project</CardTitle>
            <CardDescription>Browse and load saved backtest projects</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Browse your saved projects, review configuration snapshots, and continue where you left off.
            </p>
            <Button variant="secondary" className="w-full">Browse</Button>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => onNavigate("quick-backtest")}
        >
          <CardHeader>
            <Zap className="w-8 h-8 text-primary mb-2" />
            <CardTitle>Quick Backtest</CardTitle>
            <CardDescription>Jump straight into the portfolio backtest engine</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Run a portfolio backtest immediately with default parameters, without creating a project first.
            </p>
            <Button variant="secondary" className="w-full">Go</Button>
          </CardContent>
        </Card>
      </div>

      <NewProjectTypeDialog
        open={showNewProject}
        onOpenChange={setShowNewProject}
        onConfirm={handleCreateProject}
      />

      <OpenProjectDialog
        open={showOpenProject}
        onOpenChange={setShowOpenProject}
        onNewProject={() => setShowNewProject(true)}
      />
    </>
  );
}
