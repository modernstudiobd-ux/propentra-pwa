export default function MiniCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; current: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, current: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - firstDay - daysInMonth + 1, current: false });

  return (
    <div>
      <div className="text-sm font-semibold text-gray-800 text-center mb-3">{monthLabel}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {cells.map((c, i) => {
          const isToday = c.current && c.day === today.getDate();
          return (
            <div
              key={i}
              className={`h-7 flex items-center justify-center rounded-full transition-colors
                ${!c.current ? 'text-gray-300' : isToday ? 'bg-brand-500 text-white font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {c.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}
