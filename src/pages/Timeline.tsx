import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import {
  FileText, CreditCard, Wrench, Wallet, PiggyBank, UserPlus, UserMinus, Ban, History as HistoryIcon,
} from 'lucide-react';

type TimelineEvent = {
  date: string;
  icon: any;
  color: string;
  title: string;
  subtitle: string;
  amount?: number;
};

export default function Timeline() {
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) ?? [];
  const maintenance = useLiveQuery(() => db.maintenanceRequests.toArray(), []) ?? [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) ?? [];
  const deposits = useLiveQuery(() => db.depositTransactions.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];

  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [flatFilter, setFlatFilter] = useState<number | 'all'>('all');

  const buildingFlats = flats.filter((f) => buildingFilter === 'all' || f.buildingId === buildingFilter);
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';
  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';

  const matches = (buildingId?: number, flatId?: number) =>
    (buildingFilter === 'all' || buildingId === buildingFilter) &&
    (flatFilter === 'all' || flatId === flatFilter);

  const events: TimelineEvent[] = [];

  bills.forEach((b) => {
    if (!matches(b.buildingId, b.flatId)) return;
    events.push({
      date: b.issueDate, icon: FileText, color: 'text-brand-500',
      title: `Invoice ${b.invoiceNo} generated`,
      subtitle: `${residentName(b.residentId)} · Flat ${flatLabel(b.flatId)}`,
      amount: b.totalAmount,
    });
  });

  payments.forEach((p) => {
    if (!matches(p.buildingId, p.flatId)) return;
    if (p.voided) {
      events.push({
        date: p.voidedAt ?? p.date, icon: Ban, color: 'text-red-400',
        title: 'Payment voided', subtitle: `${residentName(p.residentId)} · ${p.method}${p.voidReason ? ` — ${p.voidReason}` : ''}`,
        amount: p.amount,
      });
    } else {
      events.push({
        date: p.date, icon: CreditCard, color: 'text-emerald-500',
        title: 'Payment received', subtitle: `${residentName(p.residentId)} · ${p.method}`, amount: p.amount,
      });
    }
  });

  maintenance.forEach((m) => {
    if (!matches(m.buildingId, m.flatId)) return;
    events.push({
      date: m.reportedDate, icon: Wrench, color: 'text-amber-500',
      title: `Maintenance: ${m.title}`, subtitle: `${m.priority} priority · ${m.status.replace('_', ' ')}`,
      amount: m.cost || undefined,
    });
    if (m.status === 'completed' && m.completedDate) {
      events.push({
        date: m.completedDate, icon: Wrench, color: 'text-emerald-500',
        title: `Maintenance completed: ${m.title}`, subtitle: m.vendorName || '',
      });
    }
  });

  expenses.forEach((e) => {
    if (!matches(e.buildingId, e.flatId)) return;
    events.push({
      date: e.date, icon: Wallet, color: 'text-gray-500',
      title: `Expense: ${e.category}`, subtitle: e.vendor || '', amount: e.amount,
    });
  });

  deposits.forEach((d) => {
    if (!matches(d.buildingId, d.flatId)) return;
    if (d.voided) return;
    const labels: Record<string, string> = { collected: 'Deposit collected', applied: 'Deposit applied to invoice', refunded: 'Deposit refunded', adjustment: 'Deposit adjusted' };
    events.push({
      date: d.date, icon: PiggyBank, color: 'text-teal-500',
      title: labels[d.type], subtitle: `${residentName(d.residentId)}${d.notes ? ` — ${d.notes}` : ''}`, amount: d.amount,
    });
  });

  residents.forEach((r) => {
    if (!matches(r.buildingId, r.flatId)) return;
    if (r.moveInDate) {
      events.push({
        date: r.moveInDate, icon: UserPlus, color: 'text-brand-500',
        title: `${r.name} moved in`, subtitle: `${r.type === 'Owner' ? 'Flat Owner' : 'Tenant'} · Flat ${flatLabel(r.flatId)}`,
      });
    }
    if (r.moveOutDate) {
      events.push({
        date: r.moveOutDate, icon: UserMinus, color: 'text-gray-400',
        title: `${r.name} moved out`, subtitle: `Flat ${flatLabel(r.flatId)}`,
      });
    }
  });

  events.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select className="input sm:w-56" value={buildingFilter} onChange={(e) => { setBuildingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setFlatFilter('all'); }}>
          <option value="all">All Buildings</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input sm:w-40" value={flatFilter} onChange={(e) => setFlatFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">All Flats</option>
          {buildingFlats.map((f) => <option key={f.id} value={f.id}>{f.unitNo}</option>)}
        </select>
      </div>

      <div className="card p-5">
        {events.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-10 flex flex-col items-center gap-2">
            <HistoryIcon size={24} className="text-gray-300" />
            No activity yet for this filter.
          </div>
        ) : (
          <div className="space-y-0">
            {events.map((e, i) => (
              <div key={i} className="flex gap-3 py-3 border-b border-gray-50 last:border-0">
                <div className={`w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0 ${e.color}`}>
                  <e.icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800">{e.title}</span>
                    {e.amount !== undefined && <span className="text-sm font-semibold text-gray-700 shrink-0">{money(e.amount)}</span>}
                  </div>
                  <div className="text-xs text-gray-400">{e.subtitle}</div>
                </div>
                <div className="text-xs text-gray-400 shrink-0 w-20 text-right">{dateLabel(e.date)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
