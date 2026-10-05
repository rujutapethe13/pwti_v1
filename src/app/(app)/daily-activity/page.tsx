import { Client360DailyActivityView } from "@/features/client-360/daily-activity-view";

export default function DailyActivityPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 py-6 lg:px-8">
      <Client360DailyActivityView variant="dashboard" />
    </div>
  );
}
