import React from "react";
import { Shift, formatTime12, getThemeClasses } from "./types";

interface MonthViewProps { currentDate: Date; shifts: Shift[]; teamMembers?: string[]; onShiftClick: (shift: Shift) => void; }
const EMPLOYEE_WIDTH = 220;
const DATE_WIDTH = 76;

export function MonthView({ currentDate, shifts, teamMembers, onShiftClick }: MonthViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => new Date(year, month, index + 1));
  const monthShifts = shifts.filter((shift) => { const date = new Date(`${shift.date}T12:00:00`); return date.getFullYear() === year && date.getMonth() === month; });
  const rows = teamMembers && teamMembers.length > 0
    ? teamMembers
    : Array.from(new Set(monthShifts.map((shift) => shift.workerName)));

  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white">
    <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-sky-600 bg-primary px-5 text-white"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/75">Monthly roster</p><h2 className="mt-0.5 text-xl font-semibold">{currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2></div><div className="hidden text-right text-[10px] text-white/75 sm:block"><b className="block text-sm text-white">{monthShifts.length} shifts</b>{rows.length} team members</div></div>
    <div className="min-h-0 flex-1 overflow-auto"><div className="flex min-h-full flex-col" style={{ minWidth: EMPLOYEE_WIDTH + DATE_WIDTH * days.length }}>
      <div className="sticky top-0 z-30 flex h-14 border-b border-slate-200 bg-white"><div className="sticky left-0 z-40 flex shrink-0 items-center border-r border-slate-200 bg-white px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400" style={{ width: EMPLOYEE_WIDTH }}>Team member</div>{days.map((day) => { const today = day.toDateString() === new Date().toDateString(); const weekend = day.getDay() === 0 || day.getDay() === 6; return <div key={day.toISOString()} className={`flex shrink-0 flex-col items-center justify-center border-r border-slate-200 ${today ? "bg-sky-50" : weekend ? "bg-slate-50" : "bg-white"}`} style={{ width: DATE_WIDTH }}><span className={`text-[9px] font-semibold uppercase ${today ? "text-primary" : "text-slate-400"}`}>{day.toLocaleDateString("en-US", { weekday: "short" })}</span><b className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs ${today ? "bg-primary text-white" : "text-slate-700"}`}>{day.getDate()}</b></div>; })}</div>
      {rows.map((employee, rowIndex) => <div key={employee} className={`flex h-[72px] border-b border-slate-100 last:border-b-0 ${rowIndex % 2 ? "bg-slate-50/45" : "bg-white"}`}><div className={`sticky left-0 z-20 flex shrink-0 items-center gap-3 border-r border-slate-200 px-4 ${rowIndex % 2 ? "bg-[#fafbfc]" : "bg-white"}`} style={{ width: EMPLOYEE_WIDTH }}><img src="/avatar-placeholder.svg" alt={employee} className="h-8 w-8 rounded-full border border-slate-200 object-cover" /><span><b className="block text-xs text-slate-800">{employee}</b><small className="text-[10px] text-slate-400">{monthShifts.filter((shift) => shift.workerName === employee).length} shifts</small></span></div>{days.map((day) => { const item = monthShifts.find((shift) => shift.workerName === employee && shift.date === toDateKey(day)); const weekend = day.getDay() === 0 || day.getDay() === 6; return <div key={day.toISOString()} className={`flex shrink-0 items-center justify-center border-r border-slate-200 p-1 ${weekend ? "bg-slate-50/65" : ""}`} style={{ width: DATE_WIDTH }}>{item ? (() => { const theme = getThemeClasses(item.theme); return <button onClick={() => onShiftClick(item)} title={`${formatTime12(item.startTime)}–${formatTime12(item.endTime)} · ${item.location}`} className={`flex h-11 w-full flex-col items-center justify-center rounded border ${theme.bg} ${theme.border} ${theme.text}`}><b className="text-[9px]">{formatTime12(item.startTime)}</b><span className="text-[8px] opacity-75">{duration(item)}h</span></button>; })() : <span className="h-1 w-1 rounded-full bg-slate-200" />}</div>; })}</div>)}
    <div className="flex min-h-0 flex-1" aria-hidden>
        <div className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-white" style={{ width: EMPLOYEE_WIDTH }} />
        {days.map((day) => { const weekend = day.getDay() === 0 || day.getDay() === 6; return <div key={`filler-${day.toISOString()}`} className={`shrink-0 border-r border-slate-200 ${weekend ? "bg-slate-50/65" : "bg-white"}`} style={{ width: DATE_WIDTH }} />; })}
      </div>
    </div></div>
    <div className="flex shrink-0 items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-400"><span>Horizontal monthly staffing overview</span><span className="ml-auto">Weekends are lightly highlighted</span></div>
  </section>;
}

function toDateKey(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function duration(shift: Shift) { const minutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }; const span = minutes(shift.endTime) - minutes(shift.startTime); return ((span >= 0 ? span : span + 24 * 60) / 60).toFixed(1); }
