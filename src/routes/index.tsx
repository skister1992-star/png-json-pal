import { createFileRoute, Link } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { Card } from "@/components/ui/card";
import { SiteHeader, useSession } from "@/components/SiteHeader";
import { IdCard, BookOpen, UserCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Character Studio" },
      { name: "description", content: "Erstelle Charakter Cards, Lorebooks und User Cards." },
    ],
  }),
  component: Home,
});

const tiles = [
  { to: "/editor", label: "CharakterCard", desc: "Charakter Cards erstellen & bearbeiten", Icon: IdCard, enabled: true },
  { to: "/lorebooks", label: "Lorebooks", desc: "Lore und Weltwissen pflegen", Icon: BookOpen, enabled: true },
  { to: "/usercard", label: "UserCard", desc: "Deine Persona definieren", Icon: UserCircle, enabled: true },
] as const;

function Home() {
  const session = useSession();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors theme="dark" position="top-right" />
      <SiteHeader session={session} />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-semibold tracking-tight">Was möchtest du erstellen?</h2>
          <p className="text-muted-foreground mt-2">Wähle einen Bereich.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {tiles.map(({ to, label, desc, Icon }) => (
            <Link key={to} to={to} className="group">
              <Card className="p-8 h-full flex flex-col items-center text-center gap-4 transition-all hover:border-primary hover:shadow-lg hover:-translate-y-1">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 grid place-items-center text-primary-foreground">
                  <Icon className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{desc}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
