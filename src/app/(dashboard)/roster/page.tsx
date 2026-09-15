import React from 'react';
import { RosterCalendar } from '@/components/roster/RosterCalendar';

export default function RosterPage() {
  return (
    // A definite height here is what lets the calendar below claim the leftover space and
    // scroll inside itself, instead of collapsing to its content and leaving the page empty.
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] flex-col pb-4">
      <RosterCalendar />
    </div>
  );
}
