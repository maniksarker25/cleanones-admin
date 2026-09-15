"use client";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MdAccessTime, MdAdd, MdArrowForward, MdBusiness, MdCall, MdCalendarToday, MdCheckCircle, MdChevronRight, MdClose, MdLocationOn, MdPeople, MdReportProblem, MdUploadFile, MdWarningAmber } from "react-icons/md";
import { CardGridSkeleton, DetailSkeleton } from "@/components/shared/SkeletonLoader";
import { useGetDashboardOverviewQuery, useGetInProgressShiftsQuery } from "@/redux/api/dashboardApi";
import { useGetTodayLiveShiftMetaQuery, useGetTodayLiveShiftsQuery } from "@/redux/api/shiftsApi";
import type { DashboardOverview, InProgressShift } from "@/services/actions/dashboard";
import { getLocale } from "@/lib/locale";
import { getDashboardTranslation, getUiTranslation } from "@/lib/translations";

const normalizeStatus = (value: string) => value.toLowerCase().replaceAll(" ", "_");
const uniqueBy = <T,>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function getInitials(name: string): string {
  if (!name) return "W";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatTimeToHHMM(value?: string): string {
  if (!value) return "---";
  if (value.includes("T")) {
    const timePart = value.split("T")[1];
    if (timePart && timePart.length >= 5) {
      return timePart.slice(0, 5);
    }
  }
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hour = Number(match[1]);
    if (match[3]?.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (match[3]?.toUpperCase() === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${match[2]}`;
  }
  return value.slice(0, 5);
}

export default function DashboardPage() {
  const pathname = usePathname();
  const locale = getLocale(pathname);
  const t = getDashboardTranslation(locale);
  const ui = getUiTranslation(locale);

  const [filter, setFilter] = useState("");
  const [liveTab, setLiveTab] = useState<
    "all" | "upcoming" | "in_progress" | "completed" | "cancelled"
  >("all");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectedLateWorker, setSelectedLateWorker] = useState<{
    worker_name: string;
    late_duration_text: string;
    phone_number: string;
    delay_reason?: string;
  } | null>(null);

  const { data: overview, isLoading: loadingOverview } = useGetDashboardOverviewQuery(filter || undefined);
  const { data: shiftsRes } = useGetInProgressShiftsQuery();
  const { data: todayLiveMeta } = useGetTodayLiveShiftMetaQuery();
  // The Live Operations tabs are sent to the API as `status`, so each tab is its own request
  // rather than a slice of one cached list.
  const { data: todayShiftsRes, isFetching: fetchingLiveShifts } = useGetTodayLiveShiftsQuery({
    limit: 100,
    page: 1,
    sort: "-date_time",
    status: liveTab === "all" ? undefined : liveTab,
  });

  // The API's greeting is built from the server clock, so the time of day is taken from the
  // viewer's own timezone instead and re-checked each minute in case a boundary passes.
  const [greetingHour, setGreetingHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setGreetingHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  const shifts: InProgressShift[] = shiftsRes?.shifts ?? [];
  // `?? []` would be a fresh array each render and re-run every memo that depends on it.
  const todayLiveShifts = useMemo(() => todayShiftsRes?.result ?? [], [todayShiftsRes]);

  const safeOverview: DashboardOverview = overview || {
    greeting: "",
    subtitle_date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    attention_banner: {
      people_need_attention_count: 0,
      badge_text: t.dashboard.allOnTime,
      banner_subtitle: t.dashboard.noWorkersRequireAttention,
      call_pills: [],
    },
    summary_cards: {
      active_shifts_count: 0,
      workers_on_site_count: 0,
      late_no_show_count: 0,
      reviews_pending_count: 0,
    },
    live_operations_by_client: [],
    open_escalations_banner: {
      open_escalations_count: 0,
      subtitle: t.dashboard.allEscalationsResolved,
      action_url: "/escalations",
    }
  };

  const attentionPills = uniqueBy(safeOverview.attention_banner.call_pills, (item) => item.worker_id);
  // `badge_text` and `banner_subtitle` are deliberately unused: the overview builds them from
  // its own `people_need_attention_count`, which can be 0 while the live meta reports a late
  // worker — that mismatch is what printed "All on time" above a late worker.
  const liveGroups = uniqueBy(safeOverview.live_operations_by_client, (group) => `${group.client_id}-${group.location_id}`).map((group) => ({
    ...group,
    workers: uniqueBy(group.workers, (worker) => worker.worker_id),
  }));
  // Only workers who need attention belong here. The old "progress under 80%" rule matched
  // almost everyone mid-shift, so a site with 200 people on shift filled this whole section;
  // the complete schedule is what Roster is for.
  const fallingBehind = uniqueBy(shifts, (item) => `${item.shift_id}-${item.worker_id}`).filter((item) => {
    const status = normalizeStatus(item.checkin_status || "");
    return status.includes("late") || status.includes("show") || status.includes("missing");
  });
  const cards = safeOverview.summary_cards;

  /**
   * The banner used to trust `people_need_attention_count` alone, while the Late Workers card
   * reads the live-shift meta. The two endpoints disagree, so a late worker could be counted
   * on the card and still show "All on time" above it. The banner now takes the highest of
   * every signal available: the overview count, the live late/no-show total, the pills the
   * overview itself returned, and the in-progress shifts flagged late or missing.
   */
  const lateWorkerCount = todayLiveMeta?.today_total_worker_late ?? cards.late_no_show_count ?? 0;
  const needAttentionCount = Math.max(
    safeOverview.attention_banner.people_need_attention_count ?? 0,
    lateWorkerCount,
    attentionPills.length,
    fallingBehind.length,
  );

  const liveOperationsRows = useMemo(() => {
    if (todayLiveShifts.length > 0) {
      const rows: Array<{
        id: string;
        worker_name: string;
        initials: string;
        profile_picture?: string;
        location_name: string;
        check_in_time: string;
        progress: number;
        status: "on_time" | "late" | "missing";
      }> = [];

      for (const shift of todayLiveShifts) {
        const locationName =
          shift.location?.name ||
          shift.location?.location ||
          (typeof shift.location === "string" ? shift.location : "") ||
          shift.client?.name ||
          "CleanOnes Location";
        const progress = Math.min(100, Math.max(0, shift.overall_progress_percent ?? (shift.status === "completed" ? 100 : 0)));

        if (shift.assigned_workers && shift.assigned_workers.length > 0) {
          for (const w of shift.assigned_workers) {
            const rawStatus = (w.attendance_status || w.status || shift.status || "").toLowerCase();
            let status: "on_time" | "late" | "missing" = "on_time";
            if (rawStatus.includes("late")) {
              status = "late";
            } else if (rawStatus.includes("missing") || rawStatus.includes("no_show") || rawStatus.includes("show")) {
              status = "missing";
            } else if (progress === 0 && shift.status !== "upcoming") {
              status = "missing";
            }

            const checkIn = w.check_in_time || w.checkin_time
              ? formatTimeToHHMM(w.check_in_time || w.checkin_time)
              : shift.status === "in_progress" || shift.status === "completed"
              ? formatTimeToHHMM(shift.date_time || shift.date)
              : "---";

            rows.push({
              id: `${shift._id}-${w.worker_id}`,
              worker_name: w.name,
              initials: getInitials(w.name),
              profile_picture: w.profile_picture || w.profile_photo,
              location_name: locationName,
              check_in_time: checkIn,
              progress,
              status,
            });
          }
        } else {
          const planTitle = typeof shift.cleaning_plan === "object" ? shift.cleaning_plan?.title : "Shift";
          rows.push({
            id: shift._id,
            worker_name: planTitle || "Unassigned Shift",
            initials: getInitials(planTitle || "US"),
            location_name: locationName,
            check_in_time: shift.date_time ? formatTimeToHHMM(shift.date_time) : "---",
            progress,
            status: shift.status === "late" ? "late" : "on_time",
          });
        }
      }
      return rows;
    }

    return shifts.map((item) => {
      const st = normalizeStatus(item.checkin_status || "");
      let status: "on_time" | "late" | "missing" = "on_time";
      if (st.includes("late")) status = "late";
      else if (st.includes("missing") || st.includes("show")) status = "missing";

      const progress = Math.min(100, Math.max(0, Number.parseFloat(item.progress_percentage) || item.progress || 0));

      return {
        id: `${item.shift_id}-${item.worker_id}`,
        worker_name: item.worker_name,
        initials: getInitials(item.worker_name),
        profile_picture: item.worker_profile_picture,
        location_name: item.location_name,
        check_in_time: item.worker_checkin_time ? formatTimeToHHMM(item.worker_checkin_time) : "---",
        progress,
        status,
      };
    });
  }, [todayLiveShifts, shifts]);

  // The tabs are shift lifecycle statuses and the row badge is check-in punctuality, so there
  // is nothing to re-filter here — the request itself is already scoped by `status`.
  const displayLiveRows = liveOperationsRows.slice(0, 6);

  const translateGreeting = (greeting: string) => {
    const localGreeting =
      greetingHour < 12
        ? t.dashboard.goodMorning
        : greetingHour < 17
          ? t.dashboard.goodAfternoon
          : t.dashboard.goodEvening;
    // Whatever the API put after its own "Good …" (the manager's name, say) is kept.
    const match = greeting.match(/^Good (?:morning|afternoon|evening)(.*)$/i);
    return match ? `${localGreeting}${match[1]}` : localGreeting;
  };

  if (loadingOverview && !overview) {
    return (
      <div className="space-y-5">
        <DetailSkeleton blocks={2} />
        <CardGridSkeleton cards={4} />
        <DetailSkeleton blocks={7} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-600">{t.dashboard.overview}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">{translateGreeting(safeOverview.greeting)}</h1>
          <p className="mt-1 text-sm text-slate-500">{safeOverview.subtitle_date}</p>
        </div>
      </header>

      {/* Red Attention Banner */}
      <section className={`rounded-xl border p-4 ${needAttentionCount > 0 ? "border-red-200 bg-red-50/70" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-wrap items-center gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white ${needAttentionCount > 0 ? "bg-red-500 shadow-xs" : "bg-emerald-500"}`}>
            {needAttentionCount > 0 ? <MdWarningAmber className="text-2xl" /> : <MdCheckCircle className="text-2xl" />}
          </span>
          <div className="flex-1 min-w-48">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`font-bold ${needAttentionCount > 0 ? "text-red-950" : "text-slate-900"}`}>
                {needAttentionCount} {needAttentionCount === 1 ? ui.workerNeedsAttention : ui.workersNeedAttention}
              </h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${needAttentionCount > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                {needAttentionCount > 0 ? ui.attentionRequired : t.dashboard.allOnTime}
              </span>
            </div>
            <p className={`text-xs sm:text-sm mt-0.5 ${needAttentionCount > 0 ? "text-red-700" : "text-slate-500"}`}>
              {needAttentionCount > 0
                ? `${needAttentionCount} ${needAttentionCount === 1 ? ui.lateWorkerSubtitle : ui.lateWorkersSubtitle}`
                : t.dashboard.noWorkersRequireAttention}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {attentionPills.length > 0 ? (
              attentionPills.map((item) => (
                <button
                  key={item.worker_id}
                  onClick={() => setSelectedLateWorker({
                    worker_name: item.worker_name,
                    late_duration_text: item.late_duration_text,
                    phone_number: item.phone_number,
                  })}
                  title={item.worker_name}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors shadow-2xs cursor-pointer"
                >
                  <img src="/avatar-placeholder.svg" alt={item.worker_name} className="h-6 w-6 rounded-full" />
                  <span>{item.late_duration_text}</span>
                  <MdCall className="text-sm" />
                </button>
              ))
            ) : needAttentionCount > 0 ? (
              // No pills came back, but something is late — never claim the schedule is clean.
              <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200/80 rounded-lg px-3 py-1.5">
                {lateWorkerCount || needAttentionCount} {ui.lateWorkers}
              </span>
            ) : (
              <span className="text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200/80 rounded-lg px-3 py-1.5">
                {t.dashboard.allShiftsOnSchedule}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Work in Progress Banner */}
      <section className={`rounded-xl border p-4 ${fallingBehind.length > 0 ? "border-sky-200 bg-sky-50/50" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center gap-2">
          <MdAccessTime className={`text-lg ${fallingBehind.length > 0 ? "text-sky-600" : "text-slate-400"}`} />
          <h2 className="font-bold text-sm sm:text-base text-slate-900">
            {t.dashboard.fallingBehindSchedule}
          </h2>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${fallingBehind.length > 0 ? "bg-sky-100 text-sky-800 border border-sky-200" : "bg-slate-100 text-slate-600"}`}>
            {fallingBehind.length} {t.dashboard.alerts}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {fallingBehind.length > 0 ? t.dashboard.shiftNearlyOver : t.dashboard.allActiveShiftsProgressing}
        </p>
        {fallingBehind.length > 0 && (
          <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
            {fallingBehind.slice(0, 6).map((item) => {
              const progress = Number.parseFloat(item.progress_percentage) || item.progress;
              return (
                <div key={`${item.shift_id}-${item.worker_id}`} className="rounded-lg border border-sky-100 bg-white p-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <img src={item.worker_profile_picture || "/avatar-placeholder.svg"} alt={item.worker_name} className="h-9 w-9 rounded-full object-cover border border-slate-100" />
                    <div className="flex-1 min-w-0">
                      <b className="block text-sm truncate text-slate-900">{item.worker_name}</b>
                      <p className="text-xs text-slate-500 truncate">{item.location_name} · {item.shift_start_time}–{item.shift_end_time}</p>
                    </div>
                    <span className="text-xs font-bold text-sky-600 shrink-0">{item.progress_percentage || `${progress}%`}</span>
                  </div>
                  <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Summary Cards from /shift/today-live-shift-meta */}
      <div className="grid gap-3.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          icon={<MdCalendarToday />}
          value={todayLiveMeta?.today_total_shift ?? todayLiveMeta?.total_shift ?? cards.active_shifts_count}
          label={ui.totalShifts}
          tone="bg-blue-50 text-blue-600"
        />
        <Metric
          icon={<MdAccessTime />}
          value={todayLiveMeta?.today_total_in_progress_shift ?? todayLiveMeta?.in_progress ?? cards.active_shifts_count}
          label={ui.inProgress}
          tone="bg-sky-50 text-sky-600"
        />
        <Metric
          icon={<MdCheckCircle />}
          value={todayLiveMeta?.today_total_completed_shift ?? todayLiveMeta?.completed_shift ?? 0}
          label={ui.completed}
          tone="bg-emerald-50 text-emerald-600"
        />
        <Metric
          icon={<MdAccessTime />}
          value={todayLiveMeta?.today_total_pending_shift ?? todayLiveMeta?.pending ?? 0}
          label={ui.pendingShifts}
          tone="bg-indigo-50 text-indigo-600"
        />
        <Metric
          icon={<MdWarningAmber />}
          value={todayLiveMeta?.today_total_worker_late ?? cards.late_no_show_count}
          label={ui.lateWorkers}
          tone="bg-red-50 text-red-600"
        />
        <Metric
          icon={<MdReportProblem />}
          value={todayLiveMeta?.total_issue_report ?? cards.reviews_pending_count}
          label={ui.issueReports}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Live Operations Widget */}
      <section className="dashboard-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">{ui.liveOperations}</h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex max-w-full overflow-x-auto rounded border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
              {(['all', 'upcoming', 'in_progress', 'completed', 'cancelled'] as const).map((tab) => {
                const active = liveTab === tab;
                const label =
                  tab === 'all'
                    ? t.dashboard.all
                    : tab === 'in_progress'
                    ? ui.inProgress
                    : tab === 'upcoming'
                    ? ui.upcoming
                    : tab === 'completed'
                    ? ui.completed
                    : ui.cancelled;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setLiveTab(tab)}
                    disabled={fetchingLiveShifts}
                    className={`h-7 rounded px-3 transition-colors cursor-pointer disabled:cursor-wait ${
                      active
                        ? 'border border-gray-200 bg-white text-primary font-semibold shadow-2xs'
                        : 'border border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Link
              href="/shift-monitoring"
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline inline-flex items-center gap-0.5 ml-1"
            >
              View all &gt;
            </Link>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {displayLiveRows.map((row) => (
            <Link
              key={row.id}
              href="/shift-monitoring"
              className="flex items-center justify-between gap-3 p-3.5 sm:px-5 hover:bg-slate-50/70 transition-colors"
            >
              {/* Left: Avatar + Name + Location */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {row.profile_picture ? (
                  <img
                    src={row.profile_picture}
                    alt={row.worker_name}
                    className="h-10 w-10 rounded-full object-cover shrink-0 border border-slate-100"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white shadow-2xs">
                    {row.initials}
                  </div>
                )}
                <div className="min-w-0">
                  <b className="block text-sm font-semibold truncate text-slate-900">{row.worker_name}</b>
                  <span className="flex items-center gap-1 text-xs text-slate-400 truncate">
                    <MdLocationOn className="text-xs shrink-0" />
                    {row.location_name}
                  </span>
                </div>
              </div>

              {/* Right side: Check-In, Progress, Status, Chevron */}
              <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                {/* Check-In */}
                <div className="text-right min-w-[50px] hidden xs:block sm:block">
                  <span className="block text-[10px] text-slate-400 font-medium">{ui.checkIn}</span>
                  <span className="block text-xs font-bold text-slate-800 mt-0.5">{row.check_in_time}</span>
                </div>

                {/* Progress */}
                <div className="w-24 sm:w-28 text-right">
                  <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-800">
                    <span className="text-[10px] text-slate-400 font-normal">{ui.progress}</span>
                    <span>{row.progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        row.status === 'late'
                          ? 'bg-amber-500'
                          : row.status === 'missing'
                          ? 'bg-red-400'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(row.progress, 0))}%` }}
                    />
                  </div>
                </div>

                {/* Status Badge */}
                <div className="min-w-[75px] flex items-center justify-start gap-1 text-xs font-semibold">
                  {row.status === 'late' ? (
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Late
                    </span>
                  ) : row.status === 'missing' ? (
                    <span className="flex items-center gap-1.5 text-red-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {ui.missing}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {ui.onTime}
                    </span>
                  )}
                </div>

                {/* Arrow */}
                <MdChevronRight className="text-slate-300 text-lg hover:text-slate-600" />
              </div>
            </Link>
          ))}

          {displayLiveRows.length === 0 && (
            <p className="py-12 text-center text-xs text-slate-400">{ui.noShiftsFound}</p>
          )}
        </div>
      </section>

      {/* Escalations Banner */}
      <Link href="/escalations" className="dashboard-card flex items-center gap-4 p-5 hover:border-amber-300 transition-colors">
        <MdWarningAmber className="text-2xl text-amber-500" />
        <div>
          <p className="font-bold text-slate-900">{safeOverview.open_escalations_banner.open_escalations_count} {t.dashboard.openEscalations}</p>
          <p className="text-xs text-slate-500">{safeOverview.open_escalations_banner.subtitle || t.dashboard.allEscalationsResolved}</p>
        </div>
        <MdArrowForward className="ml-auto text-slate-400" />
      </Link>

      {/* Attendance Alert Modal */}
      {selectedLateWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-500">
                {t.dashboard.attendanceAlert}
              </span>
              <button
                type="button"
                onClick={() => setSelectedLateWorker(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer transition-colors"
              >
                <MdClose className="text-lg" />
              </button>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-3">{selectedLateWorker.worker_name}</h3>
            <div className="rounded-lg bg-red-50 p-4 text-red-700 border border-red-100 mb-4">
              <b className="block text-sm font-bold">{selectedLateWorker.late_duration_text || t.dashboard.late}</b>
              {selectedLateWorker.delay_reason && (
                <p className="text-xs text-red-600 mt-1">Reason: {selectedLateWorker.delay_reason}</p>
              )}
            </div>
            <div className="flex items-center">
              <a
                href={`tel:${selectedLateWorker.phone_number}`}
                className="w-full flex items-center justify-center gap-1.5 h-10 rounded-lg border border-emerald-600 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 transition-colors"
              >
                <MdCall className="text-sm" />
                {t.dashboard.callEmployee}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: string }) {
  return (
    <div className="dashboard-card min-h-32 p-5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xl ${tone}`}>{icon}</span>
      <p className="mt-4 text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

