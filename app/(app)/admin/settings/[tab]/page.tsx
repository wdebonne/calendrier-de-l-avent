import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { currentDbConfig, readSavedPostgres, tableCounts } from "@/lib/db/switch";
import { getClientIp } from "@/lib/security/guard";
import { getSetting } from "@/lib/settings";
import { cn, nowIso } from "@/lib/utils";
import { AuthForm, DatabasePanel, GeneralForm, SecurityPanel, SmtpForm } from "./forms";

const TABS = ["general", "smtp", "auth", "security", "database"] as const;
type Tab = (typeof TABS)[number];

export default async function SettingsPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!(TABS as readonly string[]).includes(tab)) notFound();
  const t = await getTranslations("admin");

  let content: React.ReactNode = null;
  switch (tab as Tab) {
    case "general": {
      const [general, auth] = await Promise.all([getSetting("general"), getSetting("auth")]);
      content = <GeneralForm general={general} sessionDays={auth.sessionDays} />;
      break;
    }
    case "smtp": {
      const smtp = await getSetting("smtp");
      content = <SmtpForm smtp={{ ...smtp, password: "", hasPassword: !!smtp.password }} />;
      break;
    }
    case "auth": {
      const [auth, smtp] = await Promise.all([getSetting("auth"), getSetting("smtp")]);
      content = <AuthForm auth={auth} smtpEnabled={smtp.enabled} />;
      break;
    }
    case "security": {
      const db = await getDb();
      const [security, rules, blocks, failures] = await Promise.all([
        getSetting("security"),
        db.selectFrom("ip_rules").selectAll().orderBy("created_at", "desc").execute(),
        db.selectFrom("ip_blocks").selectAll().where("until", ">", nowIso()).orderBy("until", "desc").execute(),
        db
          .selectFrom("login_attempts")
          .selectAll()
          .where("success", "=", 0)
          .orderBy("created_at", "desc")
          .limit(30)
          .execute(),
      ]);
      content = <SecurityPanel security={security} rules={rules} blocks={blocks} failures={failures} myIp={await getClientIp()} />;
      break;
    }
    case "database": {
      const cfg = currentDbConfig();
      const saved = readSavedPostgres();
      content = (
        <DatabasePanel
          engine={cfg.engine}
          source={cfg.source}
          sqlitePath={cfg.sqlitePath}
          counts={await tableCounts()}
          saved={saved ? { host: saved.host, port: saved.port, database: saved.database, user: saved.user, ssl: saved.ssl } : null}
        />
      );
      break;
    }
  }

  return (
    <>
      <PageHeader title={t("settingsTitle")} />
      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav className="inline-flex gap-1 rounded-2xl border border-line bg-white p-1 shadow-soft">
          {TABS.map((key) => (
            <Link
              key={key}
              href={`/admin/settings/${key}`}
              className={cn(
                "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition",
                key === tab ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-100",
              )}
            >
              {t(`tabs.${key}`)}
            </Link>
          ))}
        </nav>
      </div>
      <div className="max-w-4xl">{content}</div>
    </>
  );
}
