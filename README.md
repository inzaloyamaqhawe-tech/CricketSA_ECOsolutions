# Cricket ECO Solutions

Separate deployable platform prototype for Cricket ECO Solutions.

This project uses the Cricket SA Volunteer portal only as a reference for layout, navigation, logo assets and green-gold brand coding. It is not deployed as the Volunteer platform and uses separate localStorage keys, project metadata and GitHub remote.

## What is included

- Mobile-friendly public overview page.
- Module board for the five ECO modules:
  - Player Production
  - Database Management
  - Reports Basket
  - Fixtures
  - Empowerment
- Federation onboarding flow with document upload and readiness questions.
- User dashboard for tracking an onboarding request.
- Admin dashboard for reviewing requests, exporting/importing demo data and scheduling discovery workshops.
- Node.js and Express backend foundation with PostgreSQL-compatible seed data.

## Brand and layout

The interface uses the same Cricket SA logo assets and green-gold colour variables from the reference platform:

- `--green: #026637`
- `--green-dark: #014D29`
- `--green-tint: #E7F2EA`
- `--gold: #FFCC07`
- `--gold-dark: #c99900`

The UI is responsive, with module cards, dashboard panels and roadmap rows stacking on mobile.

## Local setup

```bash
npm install
npm start
```

Open `http://localhost:4000`.

The frontend currently runs in local demo mode from `public/js/api.js`, so it works without a database. Change `USE_REMOTE_API` to `true` when the real backend and database are configured.

Demo admin login in local mode:

```text
admin@cricketeco.demo
Admin@12345
```

## Deployment

Target repository:

```text
https://github.com/inzaloyamaqhawe-tech/CricketSA_ECOsolutions.git
```

For a backend deployment, set:

- `DATABASE_URL`
- `DATABASE_SSL`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- SMTP variables when real email sending is needed

The inherited backend table names still include compatibility terms such as `volunteer_roles` and `applications`; the user-facing platform has been converted to Cricket ECO Solutions.
