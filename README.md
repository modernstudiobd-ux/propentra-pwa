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

## Notes

- **Data storage:** everything (buildings, flats, tenants, invoices, receipts, payments, settings) is stored in the browser's IndexedDB — nothing is sent to any server. Use **Backup & Restore** regularly (exports/imports a `.json` file) since clearing browser data will erase everything.
- **PWA:** installable on desktop, Android, iOS (Safari → Share → Add to Home Screen), Windows, macOS, Linux. Works offline after first load.
- **Printing invoices/receipts:** use the "Print / Save as PDF" button — it uses the browser's native print dialog (choose "Save as PDF" as the destination). No extra libraries needed.
- **Multi-device:** since data is local to each browser, use Backup & Restore to move data between devices.
