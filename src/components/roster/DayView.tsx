import React from "react";
import { MdLocationOn } from "react-icons/md";
import { Shift, formatHour12, formatTime12 } from "./types";

interface DayViewProps {
  currentDate: Date;
  shifts: Shift[];
  teamMembers?: string[];
  onShiftClick: (shift: Shift) => void;
}

const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_WIDTH = 96;
const EMPLOYEE_WIDTH = 220;
/** Narrowest a shift bar may be drawn — enough for "08:15-09:00" to stay inside it. */
const MIN_SHIFT_WIDTH = 104;
const colors = ["#0ea5e9", "#0284c7", "#06a7df", "#0891b2", "#38a9db", "#0369a1", "#0b9fd3", "#0284c7"];

export function DayView({ currentDate, shifts, teamMembers, onShiftClick }: DayViewProps) {
  const dateKey = toDateKey(currentDate);
  const dayShifts = shifts.filter((shift) => shift.date === dateKey);
  const rows = teamMembers && teamMembers.length > 0
    ? teamMembers
    : Array.from(new Set(dayShifts.map((shift) => shift.workerName)));
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
  const isToday = currentDate.toDateString() === new Date().toDateString();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentLine = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_WIDTH;
  const showCurrentLine = isToday && currentLine >= 0 && currentLine <= (END_HOUR - START_HOUR) * HOUR_WIDTH;

  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white">
    <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-sky-600 bg-primary px-5 text-white">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/75">Daily roster</p><h2 className="mt-0.5 text-xl font-semibold tracking-tight">{currentDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2></div>
      <div className="hidden items-center gap-4 text-[10px] text-white/75 sm:flex"><span><b className="text-sm text-white">{dayShifts.length}</b> shifts</span><span className="h-6 w-px bg-white/25" /><span><b className="text-sm text-white">{dayShifts.reduce((total, shift) => total + durationHours(shift), 0).toFixed(1)}h</b> scheduled</span></div>
    </div>

    <div className="min-h-0 flex-1 overflow-auto">
      <div className="relative flex min-h-full flex-col" style={{ minWidth: EMPLOYEE_WIDTH + (END_HOUR - START_HOUR) * HOUR_WIDTH }}>
        <div className="sticky top-0 z-30 flex h-12 border-b border-slate-200 bg-white">
          <div className="sticky left-0 z-40 flex shrink-0 items-center border-r border-slate-200 bg-white px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400" style={{ width: EMPLOYEE_WIDTH }}>Team member</div>
          <div className="relative" style={{ width: (END_HOUR - START_HOUR) * HOUR_WIDTH }}>
            {hours.slice(0, -1).map((hour, index) => <div key={hour} className="absolute top-0 flex h-12 items-center border-r border-slate-200 pl-2 text-[11px] font-medium text-slate-500" style={{ left: index * HOUR_WIDTH, width: HOUR_WIDTH }}>{formatHour12(hour)}</div>)}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {rows.map((employee, rowIndex) => {
            const employeeShifts = dayShifts.filter((shift) => shift.workerName === employee);
            return <div key={employee} className={`flex h-[74px] border-b border-slate-100 last:border-b-0 ${rowIndex % 2 ? "bg-slate-50/45" : "bg-white"}`}>
              <div className={`sticky left-0 z-20 flex shrink-0 items-center gap-3 border-r border-slate-200 px-4 ${rowIndex % 2 ? "bg-[#fafbfc]" : "bg-white"}`} style={{ width: EMPLOYEE_WIDTH }}>
                <img src="/avatar-placeholder.svg" alt={employee} className="h-8 w-8 rounded-full border border-slate-200 object-cover" />
                <span className="min-w-0"><b className="block truncate text-xs font-semibold text-slate-800">{employee}</b><small className="mt-0.5 block text-[10px] text-slate-400">{employeeShifts.length ? `${employeeShifts.length} shift${employeeShifts.length > 1 ? "s" : ""} today` : "Available"}</small></span>
              </div>
              <div className="relative" style={{ width: (END_HOUR - START_HOUR) * HOUR_WIDTH }}>
                {hours.slice(0, -1).map((hour, index) => <span key={hour} className="absolute inset-y-0 border-r border-slate-200/80" style={{ left: (index + 1) * HOUR_WIDTH }} />)}
                {hours.slice(0, -1).map((hour, index) => <span key={`${hour}-half`} className="absolute inset-y-0 border-r border-dashed border-slate-100" style={{ left: index * HOUR_WIDTH + HOUR_WIDTH / 2 }} />)}
                {employeeShifts.map((shift, shiftIndex) => {
                  const left = timeToPosition(shift.startTime);
                  // An end earlier than the start means the shift runs past midnight, so it is
                  // drawn to the end of the day rather than collapsing to a negative width.
                  const rawSpan = timeToPosition(shift.endTime) - left;
                  const span = rawSpan > 0 ? rawSpan : (END_HOUR - START_HOUR) * HOUR_WIDTH - left;
                  // A 30-minute shift is only ~48px wide, far too narrow for its own label, so the
                  // bar is floored at a width that always fits "08:15-09:00". It then reads a little
                  // wider than the slot it occupies, which is the trade that keeps the text inside.
                  const width = Math.max(span, MIN_SHIFT_WIDTH);
                  const color = colors[(rowIndex + shiftIndex) % colors.length];
                  const showLocation = span >= 150;
                  return <button key={shift.id ? `${shift.id}-${shiftIndex}` : `shift-${rowIndex}-${shiftIndex}`} onClick={() => onShiftClick(shift)} title={`${shift.workerName}: ${formatTime12(shift.startTime)}–${formatTime12(shift.endTime)} · ${shift.location}`} className={`absolute top-3.5 flex h-[46px] items-center overflow-hidden rounded border border-white/25 text-left text-white transition-[filter,transform] hover:z-10 hover:brightness-95 active:scale-[.995] ${showLocation ? "px-3" : "justify-center px-2"}`} style={{ left, width, backgroundColor: color }}>
                    {showLocation ? <>
                      <span className="flex min-w-0 flex-1 items-center gap-2"><b className="shrink-0 text-xs tabular-nums">{formatTime12(shift.startTime)}</b><span className="h-5 w-px shrink-0 bg-white/25" /><span className="min-w-0 truncate text-[11px] font-medium"><MdLocationOn className="mr-1 inline text-sm text-white/80" />{shift.location}</span></span><b className="ml-2 shrink-0 text-xs tabular-nums">{formatTime12(shift.endTime)}</b>
                    </> : <b className="truncate text-[11px] font-semibold tabular-nums">{formatTime12(shift.startTime)}–{formatTime12(shift.endTime)}</b>}
                  </button>;
                })}
              </div>
            </div>;
          })}
          {/* The hour grid carries on past the last team member, so the unused part of the day
              still reads as a calendar rather than a blank panel. */}
          <div className="flex min-h-0 flex-1" aria-hidden>
            <div className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-white" style={{ width: EMPLOYEE_WIDTH }} />
            <div className="relative bg-white" style={{ width: (END_HOUR - START_HOUR) * HOUR_WIDTH }}>
              {hours.slice(0, -1).map((hour, index) => <span key={hour} className="absolute inset-y-0 border-r border-slate-200/80" style={{ left: (index + 1) * HOUR_WIDTH }} />)}
              {hours.slice(0, -1).map((hour, index) => <span key={`${hour}-half`} className="absolute inset-y-0 border-r border-dashed border-slate-100" style={{ left: index * HOUR_WIDTH + HOUR_WIDTH / 2 }} />)}
            </div>
          </div>
          {showCurrentLine && <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-red-500" style={{ left: EMPLOYEE_WIDTH + currentLine }}><span className="absolute -left-[5px] -top-1 h-3 w-3 rounded-full border-2 border-white bg-red-500" /></div>}
        </div>
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-500" /> Scheduled shift</span>{isToday && <span className="flex items-center gap-1.5"><i className="h-3 w-0.5 bg-red-500" /> Current time</span>}<span className="ml-auto hidden text-slate-400 sm:block">Scroll horizontally to view the full working day</span></div>
  </section>;
}

function timeToPosition(time: string) { const [hours, minutes] = time.split(":").map(Number); return ((hours - START_HOUR) + minutes / 60) * HOUR_WIDTH; }
/** A shift ending before it starts has run past midnight, so a day is added. */
function durationHours(shift: Shift) { const span = timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime); return (span >= 0 ? span : span + 24 * 60) / 60; }
function timeToMinutes(time: string) { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes; }
function toDateKey(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
