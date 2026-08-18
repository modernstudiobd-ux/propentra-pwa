# BuildingBill — Smart Building Management Dashboard

A fully client-side PWA (no backend/server needed). All data is stored locally in the browser via **IndexedDB**. Deployable free on **GitHub Pages**.

## 1. Push to GitHub

```bash
cd buildingbill
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

## 2. Enable GitHub Pages

In your repo: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.

That's it — every push to `main` automatically builds and deploys via `.github/workflows/deploy.yml`. The app uses relative paths, so it works under **any** repo name, no config edits needed. Your site will be live at:

```
https://<your-username>.github.io/<your-repo-name>/
```

## 3. Local development

```bash
npm install
npm run dev
```

## 4. Tests

```bash
npm install
npm test        # run once
npm run test:watch
```

Tests use Vitest with `fake-indexeddb` to run Dexie against a real (in-memory) IndexedDB implementation in Node — no browser needed. Coverage includes invoice/receipt numbering, payment and deposit financial calculations, resident archiving, file-content validation (including spoofed-file detection), backup/restore round-tripping, and transaction rollback behavior.

## Notes

- **Data storage:** everything (buildings, flats, tenants, invoices, receipts, payments, settings) is stored in the browser's IndexedDB — nothing is sent to any server. Use **Backup & Restore** regularly (exports/imports a `.json` file) since clearing browser data will erase everything.
- **Privacy:** resident ID numbers are masked by default (tap to reveal); ID document photos are stored as native IndexedDB Blobs, never base64 strings floating around in memory. Audit log entries record that a sensitive field changed, never the value itself.
- **Audit log:** every payment, deposit, invoice void, resident change, document upload/delete, and backup/restore is recorded in an append-only **Audit Log** page — nothing there can be edited or deleted from the UI.
- **File uploads:** every uploaded file (ID scans, documents) is checked against its actual byte signature, not just its extension or declared MIME type, to catch mislabeled or disguised files.
- **PWA:** installable on desktop, Android, iOS (Safari → Share → Add to Home Screen), Windows, macOS, Linux. Works offline after first load.
- **Printing invoices/receipts:** use the "Print / Save as PDF" button — it uses the browser's native print dialog (choose "Save as PDF" as the destination). No extra libraries needed.
- **Multi-device:** since data is local to each browser, use Backup & Restore to move data between devices.
