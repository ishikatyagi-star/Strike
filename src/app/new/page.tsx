import { normalizeGuidedQuery, type QueryValue } from "@/app/_components/guided-demo";
import { NewMandateClient } from "./new-client";

export default async function NewMandatePage({ searchParams }: { searchParams: Promise<Record<string, QueryValue>> }) {
  const query = normalizeGuidedQuery(await searchParams);
  return <NewMandateClient guided={query.guided} initialScenario={query.scenario} />;
}
