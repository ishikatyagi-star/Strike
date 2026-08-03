import { normalizeGuidedQuery, type QueryValue } from "@/app/_components/guided-demo";
import { ReceiptClient } from "./receipt-client";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, QueryValue>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ReceiptClient id={id} guided={normalizeGuidedQuery(query).guided} />;
}
