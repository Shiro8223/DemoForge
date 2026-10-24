import { AllJobs } from "@/components/landing/all-jobs";

export default function JobsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-24 sm:px-6">
      <div className="mb-10">
        <h1 className="font-display text-[44px] leading-none">Jobs</h1>
        <p className="mt-2 text-[15px] text-muted">Every demo you&apos;ve generated, newest first.</p>
      </div>
      <AllJobs />
    </main>
  );
}
