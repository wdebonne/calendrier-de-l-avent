import { redirect } from "next/navigation";

export default async function CalendarIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/c/${id}/days`);
}
