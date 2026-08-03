import { normalizeGuidedQuery, type QueryValue } from "@/app/_components/guided-demo";
import { DemoClient } from "./demo-client";

export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, QueryValue>> }) {
  const query = normalizeGuidedQuery(await searchParams);
  return <DemoClient guided={query.guided} requestedMandateId={query.mandateId} />;
}
