import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Settings } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-foreground mb-3 tracking-tight">
            Nautilus Web Interface
          </h1>
          <p className="text-muted-foreground">
            Professional algorithmic trading platform
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
          <Card className="border-border hover:border-primary/50 transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                Trader Panel
              </CardTitle>
              <CardDescription>
                Algorithmic trading operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-6">
                Access all trading features powered by Nautilus Trader.
              </p>
              <Button
                size="lg"
                className="w-full"
                onClick={() => window.location.href = '/trader'}
              >
                Enter Trader Panel
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border hover:border-foreground/30 transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Settings className="h-5 w-5 text-muted-foreground" />
                Admin Panel
              </CardTitle>
              <CardDescription>
                System administration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-6">
                Comprehensive system administration tools.
              </p>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => window.location.href = '/admin'}
              >
                Enter Admin Panel
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
