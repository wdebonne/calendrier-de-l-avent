import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const general = await getSetting("general");
  return (
    <div className="festive-bg min-h-dvh">
      <AppNav appName={general.appName} user={{ name: user.name, email: user.email, role: user.role }} />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
