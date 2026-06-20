import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-foreground mb-4">
            Nautilus Web Interface
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Professional trading platform with comprehensive administration
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto mb-16">
          <Card className="border-primary/20 hover:border-primary/50 transition-all hover:shadow-lg">
            <CardHeader className="bg-primary text-primary-foreground rounded-t-xl">
              <CardTitle className="text-3xl">📈 Trader Panel</CardTitle>
              <CardDescription className="text-primary-foreground/80 text-lg">
                Algorithmic trading operations
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-6">
                Access all trading features powered by Nautilus Trader.
              </p>
              <Button 
                size="lg" 
                className="w-full"
                onClick={() => window.location.href = '/trader'}
              >
                Enter Trader Panel →
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border hover:border-foreground/30 transition-all hover:shadow-lg">
            <CardHeader className="bg-muted text-foreground rounded-t-xl">
              <CardTitle className="text-3xl">⚙️ Admin Panel</CardTitle>
              <CardDescription className="text-muted-foreground text-lg">
                System administration
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-6">
                Comprehensive system administration tools.
              </p>
              <Button 
                size="lg" 
                variant="outline"
                className="w-full"
                onClick={() => window.location.href = '/admin'}
              >
                Enter Admin Panel →
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
