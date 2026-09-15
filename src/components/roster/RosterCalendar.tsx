"use client";

import React, { useState, useMemo } from 'react';
import { MdCalendarToday, MdChevronLeft, MdChevronRight } from 'react-icons/md';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import dynamic from 'next/dynamic';

const ShiftModal = dynamic(() => import('./ShiftModal').then((mod) => mod.ShiftModal), { ssr: false });
import { Shift, ShiftTheme, planIdFromShift } from './types';
import { PlanDetailModal } from '@/components/cleaningPlans/PlanDetailModal';
import { PlanForm } from '@/components/cleaningPlans/PlanForm';
import { AssignWorkersModal } from '@/components/cleaningPlans/AssignWorkersModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  useDeleteCleaningPlanMutation,
  type CleaningPlan,
} from '@/redux/api/endpoints/cleaningPlans.api';
import { ContentSkeleton } from '@/components/shared/SkeletonLoader';
import { BackendPagination } from '@/components/shared/BackendPagination';
import { useGetShiftRosterQuery, type ShiftRosterParams } from '@/redux/api/rosterApi';
import { apiError } from '@/redux/api/apiError';

import { usePathname } from 'next/navigation';
import { getLocale } from '@/lib/locale';
import { getDashboardTranslation } from '@/lib/translations';

export function RosterCalendar() {
  const pathname = usePathname();
  const locale = getLocale(pathname);
  const t = getDashboardTranslation(locale);

  const [view, setView] = useState<'Day' | 'Week' | 'Month'>('Day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [page, setPage] = useState(1);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [editingPlan, setEditingPlan] = useState<CleaningPlan | null>(null);
  const [assigningPlan, setAssigningPlan] = useState<CleaningPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<CleaningPlan | null>(null);
  const [error, setError] = useState('');
  const [deletePlan, { isLoading: removingPlan }] = useDeleteCleaningPlanMutation();

  // A shift generated from a cleaning plan opens that plan's own modals, so the roster offers
  // exactly what the Cleaning Plans page does - view, edit, assign, delete - minus creating one.
  const selectedPlanId = selectedShift ? (selectedShift.planId || planIdFromShift(selectedShift.id)) : '';

  const handlePlanDelete = async (plan: CleaningPlan) => {
    try {
      await deletePlan(plan._id).unwrap();
      setDeletingPlan(null);
      setSelectedShift(null);
      setError('');
      void refetchCurrent();
    } catch (cause) {
      setDeletingPlan(null);
      setError(apiError(cause));
    }
  };

  const rosterParams: ShiftRosterParams = useMemo(() => {
    const apiView = view === 'Day' ? 'day' : view === 'Week' ? 'week' : 'month';
    if (apiView === 'month') {
      return {
        view: 'month',
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
        page,
        limit: 20,
      };
    }
    return {
      view: apiView,
      day: formatYYYYMMDD(currentDate),
      page,
      limit: 20,
    };
  }, [view, currentDate, page]);

  const {
    data: rosterRes,
    isLoading: loading,
    error: rosterError,
    refetch: refetchCurrent,
  } = useGetShiftRosterQuery(rosterParams);

  const displayError = error || (rosterError ? apiError(rosterError) : '');

  const { stats, teamMembers, shifts } = useMemo(() => {
    if (!rosterRes) {
      return { stats: { totalShifts: 0, totalHours: 0, totalMembers: 0 }, teamMembers: [], shifts: [] };
    }

    const workers = rosterRes.workers || [];
    const members = workers.map((w) => w.name);

    let calculatedHours = 0;
    const allShifts: Shift[] = [];
    const themes: ShiftTheme[] = ['blue', 'pink', 'orange', 'purple', 'green', 'teal'];
    let themeIdx = 0;

    let shiftCounter = 0;
    for (const worker of workers) {
      if (typeof worker.total_hours_in_range === 'number') {
        calculatedHours += worker.total_hours_in_range;
      }
      if (!worker.shifts_by_date) continue;
      for (const [rawDate, occurrences] of Object.entries(worker.shifts_by_date)) {
        // The date key follows the local clock too, so a shift whose local time crosses
        // midnight is filed under the same day its start time is drawn in.
        const cleanDate = rawDate.includes('T') ? toLocalDateKey(rawDate) : rawDate;
        for (const occ of occurrences || []) {
          shiftCounter += 1;
          const shiftId =
            occ.shift_id ||
            `virtual-${occ.plan_id || worker.worker_id || 'w'}-${cleanDate}-${occ.start_time || '00'}-${shiftCounter}`;
          allShifts.push({
            id: shiftId,
            workerName: worker.name,
            location: occ.location_name || 'Location',
            date: cleanDate,
            startTime: formatTimeToHHMM(occ.start_time),
            endTime: formatTimeToHHMM(occ.end_time),
            theme: themes[themeIdx++ % themes.length],
            planId: occ.plan_id,
            status: occ.status,
            isVirtual: occ.is_virtual,
          });
        }
      }
    }

    const totalShiftsCount = rosterRes.meta?.total_shifts ?? allShifts.length;
    const totalMembersCount = rosterRes.meta?.total ?? members.length;

    return {
      stats: {
        totalShifts: totalShiftsCount,
        totalHours: Math.round(calculatedHours * 10) / 10,
        totalMembers: totalMembersCount,
      },
      teamMembers: members,
      shifts: allShifts,
    };
  }, [rosterRes]);

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (view === 'Week') newDate.setDate(newDate.getDate() - 7);
    if (view === 'Month') newDate.setMonth(newDate.getMonth() - 1);
    if (view === 'Day') newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
    setPage(1);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'Week') newDate.setDate(newDate.getDate() + 7);
    if (view === 'Month') newDate.setMonth(newDate.getMonth() + 1);
    if (view === 'Day') newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
    setPage(1);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setPage(1);
  };


  const formatDateRange = () => {
    if (view === 'Month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (view === 'Week') {
      const start = new Date(currentDate);
      start.setDate(currentDate.getDate() - currentDate.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startStr} \u2013 ${endStr}`;
    }
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded border border-sky-200 bg-sky-50 text-primary">
              <MdCalendarToday className="text-base" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-800">{t.roster.title}</h1>
              <p className="text-xs text-slate-500">{t.dashboard.allShiftsOnSchedule}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded border border-gray-200 bg-white px-2.5 py-1.5">
            <strong className="font-semibold text-slate-700">{stats.totalShifts || shifts.length}</strong> {t.shiftMonitoring.shiftsCount}
          </span>
          {Boolean(stats.totalHours) && (
            <span className="rounded border border-gray-200 bg-white px-2.5 py-1.5">
              <strong className="font-semibold text-slate-700">{stats.totalHours}</strong> {t.common.duration}
            </span>
          )}
          <span className="rounded border border-gray-200 bg-white px-2.5 py-1.5">
            <strong className="font-semibold text-slate-700">{stats.totalMembers}</strong> {t.workers.employees}
          </span>
        </div>
      </div>

      <div className="sticky top-0 z-30 flex flex-col gap-3 rounded border border-gray-200 bg-white p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <button onClick={handleToday} className="h-8 rounded border border-gray-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-gray-50">
            {t.dashboard.onTime}
          </button>
          <div className="flex shrink-0 overflow-hidden rounded border border-gray-300 bg-white">
            <button onClick={handlePrev} aria-label="Previous period" className="flex h-8 w-8 items-center justify-center border-r border-gray-300 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800">
              <MdChevronLeft className="text-lg" />
            </button>
            <button onClick={handleNext} aria-label="Next period" className="flex h-8 w-8 items-center justify-center text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800">
              <MdChevronRight className="text-lg" />
            </button>
          </div>
          <h2 className="min-w-[190px] truncate text-sm font-semibold text-slate-800 sm:text-base">{formatDateRange()}</h2>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <div className="flex max-w-full overflow-x-auto rounded border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
            {(['Day', 'Week', 'Month'] as const).map(v => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  setPage(1);
                }}
                className={`h-7 rounded px-3 transition-colors ${view === v ? 'border border-gray-200 bg-white text-primary' : 'border border-transparent text-gray-500 hover:text-gray-800'}`}
              >
                {v === 'Day' ? t.roster.dayView : v === 'Week' ? t.roster.weekView : t.roster.monthView}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {displayError && <p className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{displayError}</p>}
        {loading ? <ContentSkeleton /> : <>
          {view === 'Day' && <DayView currentDate={currentDate} shifts={shifts} teamMembers={teamMembers} onShiftClick={setSelectedShift} />}
          {view === 'Week' && <WeekView currentDate={currentDate} shifts={shifts} teamMembers={teamMembers} onShiftClick={setSelectedShift} />}
          {view === 'Month' && <MonthView currentDate={currentDate} shifts={shifts} teamMembers={teamMembers} onShiftClick={setSelectedShift} />}
        </>}
      </div>

      <div className="shrink-0 pt-3">
        <BackendPagination
          page={page}
          limit={20}
          total={rosterRes?.meta?.total ?? 0}
          onPageChange={setPage}
          itemLabel="workers"
          itemCount={teamMembers.length}
        />
      </div>

      {/* Plan-backed shift: the Cleaning Plans modals, reused as-is */}
      {selectedPlanId && (
        <PlanDetailModal
          planId={selectedPlanId}
          onClose={() => setSelectedShift(null)}
          onEdit={(plan) => {
            setSelectedShift(null);
            setEditingPlan(plan);
          }}
          onDelete={(plan) => {
            setSelectedShift(null);
            setDeletingPlan(plan);
          }}
          onAssign={(plan) => {
            setSelectedShift(null);
            setAssigningPlan(plan);
          }}
        />
      )}

      {editingPlan && (
        <PlanForm
          key={editingPlan._id}
          plan={editingPlan}
          onClose={() => { setEditingPlan(null); void refetchCurrent(); }}
        />
      )}

      {assigningPlan && (
        <AssignWorkersModal
          plan={assigningPlan}
          onClose={() => { setAssigningPlan(null); void refetchCurrent(); }}
        />
      )}

      {deletingPlan && (
        <ConfirmDialog
          title="Delete cleaning plan?"
          description={`${deletingPlan.title} will be removed.`}
          confirmText="Delete"
          loading={removingPlan}
          onConfirm={() => void handlePlanDelete(deletingPlan)}
          onClose={() => !removingPlan && setDeletingPlan(null)}
        />
      )}

      {/* Shifts created straight on the roster have no plan behind them */}
      {selectedShift && !selectedPlanId && (
        <ShiftModal shift={selectedShift} onClose={() => setSelectedShift(null)} onDeleted={() => refetchCurrent()} />
      )}

    </div>
  );
}

function formatYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `2026-09-15T16:00:00.000Z` -> `2026-09-15` in the viewer's timezone. */
function toLocalDateKey(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.split('T')[0];
  return formatYYYYMMDD(parsed);
}

function formatTimeToHHMM(value?: string): string {
  if (!value) return "08:00";
  // A full timestamp is converted to the viewer's own clock. Slicing the ISO string instead
  // showed the raw UTC time, so a 16:00Z shift read as 16:00 here while the plan modal -
  // which parses the same value as a Date - correctly showed 22:00 local.
  if (value.includes("T")) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
    }
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
