# LOCAR.MA
**Car Rental Agency Management SaaS — MVP Specification**  
Version 1.0 · July 2026 · Morocco Market

---
new
## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Market & Positioning](#2-market--positioning)
3. [MVP Scope](#3-mvp-scope)
4. [Technical Architecture](#4-technical-architecture)
5. [Database Schema](#5-database-schema)
6. [UX & Key Flows](#6-ux--key-flows)
7. [Build Roadmap](#7-build-roadmap)
8. [Pricing Model](#8-pricing-model)
9. [Risks & Mitigations](#9-risks--mitigations)
10. [Success Metrics](#10-success-metrics)

---

## 1. Executive Summary

Morocco's car rental sector is growing at historic pace — nearly 20 million tourists in 2025, with acceleration expected ahead of the 2030 FIFA World Cup. Yet the vast majority of independent agencies (1–50 vehicles) still manage through paper contracts, WhatsApp threads, and disconnected spreadsheets.

**Locar.ma** is a SaaS web application purpose-built for this market. Not adapted from a generic template. Not translated from a French product. Built around how a Moroccan agency actually operates: cash transactions, blank-check guarantees, Arabic/French bilingual workflows, WhatsApp as primary communication, and constant pressure from price competition and fraud.

The MVP targets the daily operational core: reservations, fleet, contracts, clients, invoicing. Everything an agency needs to go fully digital from day one.

### The core problem

- No unified system to protect agencies from client fraud (disappeared vehicles, bad checks)
- Double bookings are a daily occurrence without real-time availability
- Contract generation is manual, slow, error-prone
- International tools don't understand Moroccan payment infrastructure
- Local tools (GoCar, GestLoc, GENIPARC) have dated UX and partial feature sets

### The opportunity

- ~8,000 active car rental agencies registered in Morocco
- Less than 15% use any digital management software
- Agencies cite "WhatsApp support" and "understanding the Moroccan market" as top selection criteria
- Right product at 299–499 MAD/month has clear ROI on day one

---

## 2. Market & Positioning

### Competitive Landscape

| Product | Strengths | Key Gap |
|---|---|---|
| Rentyx.ma | Morocco-built, WhatsApp support, clean UI | New, small user base, no blacklist |
| GestLoc.ma | Multi-agency, drag & drop calendar | Generic feel, no WhatsApp native flow |
| GoCar.ma | Established, frontend + backend | Dated UI, slow iteration |
| GENIPARC | Casablanca-focused, customizable | Not cloud-native, heavy onboarding |
| GestFlotte | Fleet-first, Morocco + France | Weak booking and CRM |
| TIPCAR | Mobile-friendly, Agadir/Rabat | Shallow CRM, no shared blacklist |

### Our Differentiation

- **Shared client blacklist** — cross-agency, opt-in, Morocco-first (Phase 2)
- **WhatsApp-native flow** — send contracts and confirmations directly from the app
- **Photo damage documentation** — timestamped at pickup and return, linked to contract
- **Arabic-first UI** — full RTL support throughout, not an afterthought
- **CMI payment integration** — local cards, not Stripe-only (Phase 2)
- **Blank check tracking** — log guarantee checks per contract, alert on disputes

---

## 3. MVP Scope

> The MVP is intentionally narrow. Goal: get an agency fully operational — paperless, no double bookings, instant contracts — in under 2 weeks from signup.

### Modules In Scope

#### 1. Auth & Agency Onboarding
- Email/password + magic link login via Supabase Auth
- Agency setup wizard: name, logo, city, fleet size, language preference (AR/FR/EN)
- Role system: Owner, Agent, Accountant — per-agency, Row Level Security enforced
- Multi-branch: each branch is a sub-entity of the agency with shared fleet visibility

#### 2. Fleet Management
- Add vehicles: plate, brand, model, year, category, daily rate, status
- Vehicle status: `available` / `rented` / `maintenance` / `reserved`
- Maintenance alerts: insurance expiry, vignette, technical visit — auto-notifications
- Damage log per vehicle with photo attachments (Supabase Storage)
- Mileage tracking: recorded at each contract open/close

#### 3. Reservation Calendar
- Visual drag-and-drop calendar per vehicle or per date range
- Real-time availability — Supabase Realtime, syncs across all open tabs/devices
- Block dates manually (maintenance, personal use, hold)
- Zero double-booking guarantee — constraint enforced at DB level, not just UI
- Quick-create reservation from calendar click: client, vehicle, dates, rate

#### 4. Contract & Invoice Generation
- One-click contract generation from confirmed reservation
- PDF output via React-PDF: bilingual AR/FR, agency logo, full legal fields
- Fields: client info, vehicle condition, mileage out/in, fuel level, extras, total, signature line
- Blank check field: check number, bank, amount — logged and searchable
- Invoice auto-calculated from contract dates and daily rate
- Send PDF via WhatsApp directly from contract view (Meta Cloud API)

#### 5. Client CRM
- Client profile: name, CIN/passport, phone, email, nationality, address
- Full rental history per client across all contracts
- Client status: `active` / `flagged` / `blacklisted`
- Blacklist flag: reason, date, flagged by — visible to all agents in the agency
- Quick search by name, CIN, or plate number

#### 6. Basic Financial Dashboard
- Revenue today / this week / this month
- Revenue per vehicle — identify most/least profitable cars
- Upcoming returns and pending payments
- Outstanding contracts (overdue returns)
- Export to CSV — accountant-ready

---

### Modules Out of Scope (MVP)

| Feature | Reason | Target Phase |
|---|---|---|
| OTA channel sync (Booking.com) | Complex API, not day-1 need | Phase 2 |
| Online booking page for clients | B2B focus first | Phase 2 |
| GPS vehicle tracking | Hardware dependency | Phase 2 |
| Shared cross-agency blacklist | Network effect needs users first | Phase 2 |
| CMI payment processing | Lengthy bank integration | Phase 2 |
| Mobile native app | PWA covers mobile MVP needs | Phase 3 |
| Advanced accounting / P&L | Out of rental ops core | Phase 3 |
| AI pricing suggestions | Data needed first | Phase 3 |

---

## 4. Technical Architecture

### Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | TanStack Start | Full-stack, end-to-end type safety, server functions |
| Routing | TanStack Router | Typed params, search, loaders |
| Server state | TanStack Query | Caching, background refetch, optimistic updates |
| Tables / grids | TanStack Table | Headless — full styling control |
| Forms | TanStack Form + Zod | Type-safe validation, no re-render noise |
| UI components | shadcn/ui + Tailwind | Unstyled base, craft-level control |
| Database | Supabase (PostgreSQL) | RLS multi-tenant, Realtime, Storage, Auth |
| Auth | Supabase Auth | Multi-role per agency, magic link + password |
| File storage | Supabase Storage | Damage photos, scanned IDs, contract PDFs |
| PDF generation | React-PDF | Server-side, bilingual AR/FR, per-agency branding |
| WhatsApp | Meta Cloud API | Send contracts, confirmations, reminders |
| Automation | n8n (self-hosted) | WhatsApp webhooks, maintenance alert triggers |
| Hosting | CapRover on Hetzner | Existing infra, Docker-based, zero lock-in |

### Project Structure

```
locar/
├── app/
│   ├── routes/
│   │   ├── _auth/          # login, register, onboarding
│   │   ├── dashboard/      # main layout + overview
│   │   ├── fleet/          # vehicle list, detail, add
│   │   ├── reservations/   # calendar, new, detail
│   │   ├── contracts/      # list, detail, PDF preview
│   │   ├── clients/        # CRM list, profile, blacklist
│   │   └── finance/        # dashboard, CSV export
│   ├── components/
│   │   ├── ui/             # shadcn base components
│   │   ├── calendar/       # reservation calendar
│   │   ├── pdf/            # React-PDF contract templates
│   │   └── shared/         # layout, nav, modals
│   ├── lib/
│   │   ├── supabase.ts     # client + server instances
│   │   ├── whatsapp.ts     # Meta Cloud API wrapper
│   │   └── pdf.ts          # PDF generation helpers
│   └── server/
│       └── functions/      # TanStack server functions
├── supabase/
│   └── migrations/         # SQL migration files
└── public/
```

---

## 5. Database Schema

### `agencies`
```sql
create table agencies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  city          text,
  logo_url      text,
  language      text default 'fr',   -- ar / fr / en
  plan          text default 'free', -- free / starter / pro / agency
  created_at    timestamptz default now()
);
```

### `agency_members`
```sql
create table agency_members (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references agencies on delete cascade,
  user_id     uuid references auth.users on delete cascade,
  role        text not null,  -- owner / agent / accountant
  full_name   text,
  phone       text,
  unique (agency_id, user_id)
);
```

### `vehicles`
```sql
create table vehicles (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid references agencies on delete cascade,
  plate               text not null,
  brand               text,
  model               text,
  year                int,
  category            text,  -- economy / suv / luxury / utility
  daily_rate          numeric not null,
  status              text default 'available',
  mileage_current     int default 0,
  insurance_expiry    date,
  vignette_expiry     date,
  visite_tech_expiry  date,
  notes               text,
  created_at          timestamptz default now(),
  unique (agency_id, plate)
);
```

### `clients`
```sql
create table clients (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid references agencies on delete cascade,
  full_name         text not null,
  cin_passport      text,
  phone             text,
  email             text,
  nationality       text,
  address           text,
  status            text default 'active',  -- active / flagged / blacklisted
  blacklist_reason  text,
  blacklist_date    date,
  blacklisted_by    uuid references agency_members,
  created_at        timestamptz default now()
);
```

### `reservations`
```sql
create table reservations (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid references agencies on delete cascade,
  vehicle_id        uuid references vehicles,
  client_id         uuid references clients,
  date_start        date not null,
  date_end          date not null,
  pickup_location   text,
  dropoff_location  text,
  status            text default 'pending',
  -- pending / confirmed / active / closed / cancelled
  total_amount      numeric,
  daily_rate_snap   numeric,  -- rate at time of booking (immutable)
  notes             text,
  created_by        uuid references agency_members,
  created_at        timestamptz default now(),

  -- no double booking: enforced at DB level
  constraint no_overlap exclude using gist (
    vehicle_id with =,
    daterange(date_start, date_end, '[]') with &&
  ) where (status not in ('cancelled'))
);
```

### `contracts`
```sql
create table contracts (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid references reservations,
  agency_id       uuid references agencies on delete cascade,
  mileage_out     int,
  mileage_in      int,
  fuel_out        text,  -- empty / quarter / half / three_quarters / full
  fuel_in         text,
  check_number    text,
  check_bank      text,
  check_amount    numeric,
  check_status    text default 'held',  -- held / released / disputed
  extras          jsonb default '[]',   -- [{name, price}]
  pdf_url         text,
  signed_at       timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz default now()
);
```

### `damage_reports`
```sql
create table damage_reports (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid references contracts on delete cascade,
  vehicle_id   uuid references vehicles,
  type         text not null,  -- pickup / return
  photo_urls   text[] default '{}',
  notes        text,
  recorded_by  uuid references agency_members,
  recorded_at  timestamptz default now()
);
```

### `maintenance_alerts`
```sql
create table maintenance_alerts (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid references vehicles on delete cascade,
  agency_id   uuid references agencies,
  type        text,  -- insurance / vignette / visite_tech / custom
  due_date    date,
  sent_at     timestamptz,
  resolved_at timestamptz,
  created_at  timestamptz default now()
);
```

### Row Level Security (RLS)

```sql
-- agencies: members can only see their own agency
alter table vehicles enable row level security;
create policy "agency members only" on vehicles
  using (agency_id in (
    select agency_id from agency_members where user_id = auth.uid()
  ));
-- same pattern applied to all tables
```

---

## 6. UX & Key Flows

### Design Principles
- Speed over features — every critical action reachable in 2 clicks
- Mobile-first — agents use phones at airport pickup, not desktops
- Arabic/French toggle — persisted per user, affects full UI and PDF output
- No onboarding debt — sensible defaults, customize later
- High-contrast, data-forward — no gradient heroes, no decorative fluff

---

### Flow 1 — New Reservation
1. Agent clicks date range on calendar → modal opens with vehicle pre-selected
2. Search or select client (autocomplete by name/CIN) — or create new inline
3. Set pickup/dropoff location, rate override if needed, extras
4. System validates: no overlapping reservation → blocks if conflict at DB level
5. Confirm → reservation created, status `confirmed`
6. Client receives WhatsApp confirmation (if phone on file): dates, vehicle, total

### Flow 2 — Contract Pickup
1. Agent opens confirmed reservation → "Start Rental"
2. Record mileage out, fuel level, photograph vehicle (camera or file upload)
3. Log blank check number + bank if applicable
4. Generate PDF contract → preview → send via WhatsApp or print
5. Status: reservation → `active`, vehicle → `rented`

### Flow 3 — Contract Return & Close
1. Agent opens active contract → "Close Rental"
2. Record mileage in, fuel level, photograph vehicle on return
3. System auto-calculates extra days if overdue, fuel penalty if applicable
4. Generate return invoice → send to client via WhatsApp
5. Status: contract → `closed`, vehicle → `available`
6. Guarantee check status: `released` / `held` / `disputed`

### Flow 4 — New Client with Blacklist Check
1. Agent enters CIN or passport number during client creation
2. System checks against agency blacklist before saving
3. If match → warning banner with reason and date flagged
4. Agent must confirm to proceed (override logged) or cancel

---

## 7. Build Roadmap

### MVP — 6–8 Weeks (Solo)

| Phase | Timeline | Deliverable |
|---|---|---|
| 1 — Foundation | Week 1–2 | Scaffold, Supabase schema + RLS, Auth, agency onboarding wizard |
| 2 — Fleet | Week 2–3 | Vehicle CRUD, status management, maintenance alert system |
| 3 — Reservations | Week 3–4 | Calendar UI, real-time availability, conflict check |
| 4 — Contracts | Week 4–5 | Contract form, PDF generation (AR/FR), damage photos, WhatsApp send |
| 5 — CRM | Week 5–6 | Client profiles, history, blacklist, search |
| 6 — Finance + Polish | Week 6–8 | Revenue dashboard, CSV export, mobile QA, Arabic RTL audit, deploy |

### Phase 2 Backlog

- Shared cross-agency blacklist network (opt-in, network effect)
- OTA channel sync — Booking.com, Expedia, CarTrawler
- Online booking page for end clients
- CMI payment integration (local card processing)
- GPS integration via GeoFlotte API
- Automated WhatsApp reminders: upcoming return, overdue, maintenance due
- Multi-currency: MAD / EUR / USD per contract
- Agency white-label: custom domain, branded client portal

### Phase 3 Backlog

- Native mobile app (React Native or Expo)
- Advanced accounting / P&L reporting
- AI-powered pricing suggestions based on season and demand
- Shared driver network (agencies share vetted drivers)

---

## 8. Pricing Model

> Calibrated to Moroccan agency economics. A 10-vehicle agency generates ~15,000–30,000 MAD/month. Software at 400 MAD/month is under 3% of revenue — easy ROI.

| Plan | Price | Vehicles | Users | Key Limits |
|---|---|---|---|---|
| Starter | 299 MAD/month | Up to 10 | 2 agents | Single branch, no WhatsApp send |
| Pro | 499 MAD/month | Up to 30 | 5 agents | Multi-branch, WhatsApp included |
| Agency | 899 MAD/month | Unlimited | Unlimited | Priority support, API access |
| Pay-as-you-go | 15 MAD/contract | Unlimited | 1 agent | Risk-free entry for small operators |

### Go-To-Market

- Launch in Tangier, Agadir, and Marrakech — highest agency density outside Casablanca
- WhatsApp-first outreach to agency owners — matches their communication style
- Free 30-day trial, no credit card — zero friction to signup
- Partner with FNAVM for sector credibility
- Referral: 1 month free per agency referred

---

## 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Agencies resistant to digitization | Medium | Pay-as-you-go lowers barrier; Arabic onboarding reduces friction |
| Price war — competitors undercut | High | Differentiate on blacklist network + WhatsApp native — hard to clone fast |
| CMI integration delays | High | Launch Stripe-only + cash tracking; CMI in Phase 2 |
| Meta Cloud API rate limits / cost | Low | n8n queue for non-urgent; use templated messages (lower cost tier) |
| Data loss / uptime | Low | Supabase daily backups; CapRover redundancy on Hetzner |
| CNDP data compliance (Law 09-08) | Medium | CIN/passport encrypted at rest; compliant privacy policy on signup |
| Blank check regulation changes | Low | Track as optional field; not business logic dependent |

---

## 10. Success Metrics

### 6-Month Targets

| Metric | Target | How Measured |
|---|---|---|
| Agencies signed up | 50 | Supabase auth.users per agency |
| Paying (post-trial) | 30 | Stripe / manual invoice |
| Contracts generated | 2,000+ | `contracts` table row count |
| Avg sessions / agent / day | > 3 | Analytics event tracking |
| Monthly churn | < 8% | Plan cancellations / active agencies |
| NPS score | > 40 | In-app survey at 30-day mark |
| WhatsApp support response | < 2h | Manual tracking initially |

### Definition of MVP Done

- [ ] Agency can sign up, add fleet, and create first contract in under 20 minutes
- [ ] Zero double bookings possible — enforced at DB constraint level
- [ ] PDF contract generated in Arabic or French in under 5 seconds
- [ ] WhatsApp delivery works for Moroccan numbers
- [ ] Works on mobile (Chrome/Safari) — no app install required
- [ ] Passes 1-week beta with 3 real agencies in Tangier and Agadir

---

*Locar.ma MVP Specification · Version 1.0 · July 2026 · Confidential*
