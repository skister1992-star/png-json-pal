import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { Card } from "@/components/ui/card";
import { SiteHeader, useSession } from "@/components/SiteHeader";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/lorebooks")({
  ssr: false,
  head: () => ({ meta: [{ title: "Lorebooks" }] }),
  component: LorebooksPage,
});

function LorebooksPage() {
  const session = useSession();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors theme="dark" position="top-right" />
      <SiteHeader session={session} />
      <main className="max-w-3xl mx-auto px-6 py-20 text-center">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold">Lorebooks</h2>
        <p className="text-muted-foreground mt-2">Platzhalter — kommt bald.</p>
        <Card className="mt-8 p-8 text-sm text-muted-foreground">
          Hier wirst du eigenständige Lorebooks erstellen und verwalten können.
        </Card>
      </main>
    </div>
  );
}
