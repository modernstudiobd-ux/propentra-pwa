import { HelpCircle } from 'lucide-react';

const faqs = [
  { q: 'Where is my data stored?', a: 'Everything (buildings, flats, residents, invoices, receipts, payments) is stored locally in your browser using IndexedDB. Nothing is sent to any server.' },
  { q: 'How do I move my data to another device or browser?', a: 'Go to Backup & Restore, click "Backup Now" to download a JSON file, then use "Restore Data" on the other device to import it.' },
  { q: 'What happens if I clear my browser data?', a: 'IndexedDB data will be permanently deleted. Always keep a recent backup from the Backup & Restore page.' },
  { q: "What's the difference between a Tenant and a Flat Owner?", a: 'Both are types of Residents. Use "Tenant" for renters and "Flat Owner" for residents who own their unit — this only affects labeling and reporting, not billing logic.' },
  { q: 'How do I generate an invoice?', a: 'Go to Billing → Bill Generator, select the building/flat/resident, enter meter readings and charges, then click "Generate Invoice". You can print or save it as PDF from the preview panel.' },
  { q: 'Can I add charges beyond the default ones?', a: 'Yes — in Bill Generator, click "Add Charge" under the Charges section to add any custom charge line with its own label and amount.' },
];

export default function Help() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="text-brand-500" size={20} />
          <h2 className="font-semibold text-gray-800">Frequently Asked Questions</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {faqs.map((f) => (
            <div key={f.q} className="py-3">
              <div className="font-medium text-gray-800 text-sm mb-1">{f.q}</div>
              <div className="text-sm text-gray-500">{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
