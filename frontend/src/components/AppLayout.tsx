import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { API_CONFIG } from "@/config";
import { ArrowLeft, LogOut } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  backTo?: string;
  actions?: ReactNode;
  headerContent?: ReactNode;
}

export default function AppLayout({
  children,
  title,
  subtitle,
  backTo,
  actions,
  headerContent,
}: AppLayoutProps) {
  const handleLogout = async () => {
    const token = localStorage.getItem("nautilus_token");
    if (token) {
      try {
        await fetch(`${API_CONFIG.NAUTILUS_API_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    localStorage.removeItem("nautilus_token");
    localStorage.removeItem("nautilus_role");
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background">
      {headerContent ? (
        headerContent
      ) : title ? (
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {backTo && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => (window.location.href = backTo)}
                  className="text-muted-foreground hover:text-foreground -ml-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div>
                <h1 className="text-lg font-semibold text-foreground tracking-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <ThemeToggle />
              <button
                onClick={handleLogout}
                title="Logout"
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
      ) : (
        <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
