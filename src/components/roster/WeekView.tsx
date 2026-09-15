import React from "react";
import { MdLocationOn } from "react-icons/md";
import { Shift, formatTime12, getThemeClasses } from "./types";

interface WeekViewProps { currentDate: Date; shifts: Shift[]; teamMembers?: string[]; onShiftClick: (shift: Shift) => void; }
const EMPLOYEE_WIDTH = 220;
const DAY_WIDTH = 178;

export function WeekView({ currentDate, shifts, teamMembers, onShiftClick }: WeekViewProps) {
  const start = new Date(currentDate);
  start.setDate(currentDate.getDate() - currentDate.getDay());
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const weekKeys = new Set(days.map(toDateKey));
  const weekShifts = shifts.filter((shift) => weekKeys.has(shift.date));
  const rows = teamMembers && teamMembers.length > 0
    ? teamMembers
    : Array.from(new Set(weekShifts.map((shift) => shift.workerName)));

  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white">
    <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-sky-600 bg-primary px-5 text-white"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/75">Weekly roster</p><h2 className="mt-0.5 text-xl font-semibold">{days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</h2></div><div className="hidden text-right text-[10px] text-white/75 sm:block"><b className="block text-sm text-white">{weekShifts.length} shifts</b>{weekShifts.reduce((total, shift) => total + duration(shift), 0).toFixed(1)} scheduled hours</div></div>
    <div className="min-h-0 flex-1 overflow-auto"><div className="flex min-h-full flex-col" style={{ minWidth: EMPLOYEE_WIDTH + DAY_WIDTH * 7 }}>
      <div className="sticky top-0 z-30 flex h-14 border-b border-slate-200 bg-white"><div className="sticky left-0 z-40 flex shrink-0 items-center border-r border-slate-200 bg-white px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400" style={{ width: EMPLOYEE_WIDTH }}>Team member</div>{days.map((day) => { const today = day.toDateString() === new Date().toDateString(); return <div key={day.toISOString()} className={`flex shrink-0 items-center justify-between border-r border-slate-200 px-3 last:border-r-0 ${today ? "bg-sky-50" : "bg-white"}`} style={{ width: DAY_WIDTH }}><span><b className={`block text-[10px] uppercase ${today ? "text-primary" : "text-slate-400"}`}>{day.toLocaleDateString("en-US", { weekday: "short" })}</b><span className="text-xs font-semibold text-slate-700">{day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></span>{today && <i className="h-2 w-2 rounded-full bg-primary" />}</div>; })}</div>
      {rows.map((employee, rowIndex) => <div key={employee} className={`flex min-h-[88px] border-b border-slate-100 last:border-b-0 ${rowIndex % 2 ? "bg-slate-50/45" : "bg-white"}`}><div className={`sticky left-0 z-20 flex shrink-0 items-center gap-3 border-r border-slate-200 px-4 ${rowIndex % 2 ? "bg-[#fafbfc]" : "bg-white"}`} style={{ width: EMPLOYEE_WIDTH }}><img src="/avatar-placeholder.svg" alt={employee} className="h-8 w-8 rounded-full border border-slate-200 object-cover" /><span><b className="block text-xs text-slate-800">{employee}</b><small className="text-[10px] text-slate-400">{weekShifts.filter((shift) => shift.workerName === employee).length} shifts this week</small></span></div>{days.map((day) => { const items = weekShifts.filter((shift) => shift.workerName === employee && shift.date === toDateKey(day)); return <div key={day.toISOString()} className="flex shrink-0 flex-col justify-center gap-1.5 border-r border-slate-200 p-2 last:border-r-0" style={{ width: DAY_WIDTH }}>{items.length ? items.map((shift, sIdx) => { const theme = getThemeClasses(shift.theme); return <button key={shift.id ? `${shift.id}-${sIdx}` : `shift-${sIdx}`} onClick={() => onShiftClick(shift)} className={`rounded border border-l-[3px] px-2.5 py-2 text-left ${theme.bg} ${theme.border} ${theme.text}`}><span className="flex items-center justify-between gap-2 text-[10px] font-bold"><span>{formatTime12(shift.startTime)}</span><span>{formatTime12(shift.endTime)}</span></span><span className="mt-1 block truncate text-[9px] font-medium opacity-80"><MdLocationOn className="mr-0.5 inline" />{shift.location}</span></button>; }) : <span className="text-center text-[10px] text-slate-300">Available</span>}</div>; })}</div>)}
    <div className="flex min-h-0 flex-1" aria-hidden>
        <div className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-white" style={{ width: EMPLOYEE_WIDTH }} />
        {days.map((day) => <div key={`filler-${day.toISOString()}`} className={`shrink-0 border-r border-slate-200 last:border-r-0 ${day.toDateString() === new Date().toDateString() ? "bg-sky-50/40" : "bg-white"}`} style={{ width: DAY_WIDTH }} />)}
      </div>
    </div></div>
    <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-400">Scroll horizontally to compare the full working week</div>
  </section>;
}

function toDateKey(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function duration(shift: Shift) { const minutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }; const span = minutes(shift.endTime) - minutes(shift.startTime); return (span >= 0 ? span : span + 24 * 60) / 60; }
