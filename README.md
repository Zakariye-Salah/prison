Prison Management App — Complete bundle
--------------------------------------

This bundle includes a Node/Express backend and a vanilla JS frontend SPA that implements the features requested:
- Controller (admin) vs Viewer roles + 4-digit admin secret flow
- Criminals, Rooms, Users models with atomic counters
- Soft delete (recycle bin), restore, permanent delete
- Payments for fines (partial/full) with validations
- Live countdown on criminal view (frontend)
- Skeleton loaders and spinner UI patterns
- PDF export using PDFKit
- Seed script to create an initial Controller admin (prints 4-digit secret)

How to run
1. unzip or extract this package.
2. In PowerShell or terminal, `cd backend`
3. Install deps:
   npm cache clean --force
   npm set registry https://registry.npmjs.org/
   npm install --registry=https://registry.npmjs.org/
4. Optionally seed admin:
   npm run seed
5. Start dev server:
   npm run dev
6. Open `frontend/index.html` in your browser (or serve it with a static server). Backend APIs run on port 5000 by default.

If you hit `multer` or `ETARGET` install errors, see suggestions in the project folder or ask me and paste the error output here.
