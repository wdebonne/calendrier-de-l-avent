"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Files, Trash2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { deleteCalendarAction, duplicateCalendarAction } from "../../../actions";

export function DangerZone({ id }: { id: string }) {
  const t = useTranslations("calendar");
  const td = useTranslations("dashboard");
  const tc = useTranslations("common");
  const [pending, start] = useTransition();
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <Button variant="outline" disabled={pending} onClick={() => start(() => duplicateCalendarAction(id))}>
        <Files className="h-4 w-4" /> {td("duplicate")}
      </Button>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (confirm(t("deleteConfirm"))) start(() => deleteCalendarAction(id));
        }}
      >
        <Trash2 className="h-4 w-4" /> {tc("delete")}
      </Button>
    </Card>
  );
}
