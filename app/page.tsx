import { redirect } from "next/navigation";
import { getCurrentUser, userCount } from "@/lib/auth/session";

export default async function Home() {
  if ((await userCount()) === 0) redirect("/setup");
  redirect((await getCurrentUser()) ? "/dashboard" : "/login");
}
