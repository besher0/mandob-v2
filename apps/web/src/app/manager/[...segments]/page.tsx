import { notFound } from "next/navigation";
import ApplicationRoot from "@/features/app/ApplicationRoot";
import { parseManagerRoute } from "@/features/manager/manager-routes";
export default async function ManagerPage({ params }: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await params;
  if (!parseManagerRoute(segments)) notFound();
  return <ApplicationRoot/>;
}
