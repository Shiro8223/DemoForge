import { JobView } from "@/components/generation/job-view";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <JobView jobId={jobId} />;
}
