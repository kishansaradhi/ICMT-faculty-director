# ICMT — Indian Commerce and Management Teachers

Official website and centralized academic faculty directory for the **Indian Commerce and Management Teachers (ICMT)** platform.

## Project Structure

```text
ICMT_FACULTY_DIRECTORY/
├── index.html              # Main ICMT Website Homepage
├── about-us.html           # About ICMT, Vision, Mission & Leadership
├── initiatives.html        # Our Key Academic & Research Initiatives
├── events.html             # National Conferences, Seminars & Workshops
├── resources.html          # Academic Guidelines, Teaching Repositories & Tools
├── contact.html            # Secretariat Contact Information & Inquiry Form
├── faculty.html            # Public Faculty Information & Mentors Page
├── public-directory.html   # Public Faculty Directory (Search, Filter, Grid/Table & Modal)
├── member-profile.html     # Dedicated Standalone Public Member Profile (?id=ICMTxxx)
├── admin.html              # Administrator Portal (Login, Dashboard, Member Management, Users, Logout)
├── README.md               # Documentation & Navigation Architecture
│
├── css/
│   └── style.css           # Central Stylesheet (Lato typography, ICMT theme tokens & UI layout)
│
├── js/
│   ├── app.js              # Admin Management & Dashboard Logic
│   └── api-config.js       # API base URL for local or deployed backend
│
├── backend/
│   ├── app/                # FastAPI service and SQLite models
│   └── seed/member-data.js # One-time import source; not publicly served
│
└── images/
    └── new/                # Clean Faculty Portrait Photos
```

## Navigation Flows

1. **Public Flow**:
   **Home** (`index.html`) &rarr; **Faculty** &rarr; **Faculty Information** (`faculty.html`) &rarr; **Faculty Directory** (`public-directory.html`) &rarr; **Member Profile** (`member-profile.html`)

2. **Admin Flow**:
   **Admin Login** &rarr; **Dashboard** &rarr; **Member Management** &rarr; **User Management** &rarr; **Logout** (`admin.html`)

## Backend API (FastAPI + SQLite)

The directory now supports a FastAPI service backed by SQLite. On a local first server start, it imports `backend/seed/member-data.js` into `backend/icmt.db`. This seed file and the resulting SQLite database are ignored by Git, so neither can be pushed to the public repository. The member data file is not loaded by public pages.

1. Install Python 3.11 or newer.
2. From the project root, run `py -m venv backend/.venv`, then activate it in PowerShell with `backend\.venv\Scripts\Activate.ps1`.
3. Install dependencies: `pip install -r backend/requirements.txt`.
4. Copy `backend/.env.example` to `backend/.env`. Set a strong `ADMIN_PASSWORD` and `ICMT_SESSION_SECRET`; never commit this file.
5. Start the server: `uvicorn app.main:app --app-dir backend --reload`.
6. Visit `http://127.0.0.1:8000/health`. It should report 343 members after the first import.

Set the deployed HTTPS API address in `js/api-config.js` before publishing. The public directory and individual profile pages use read-only API endpoints. Admin login, member changes, and member submissions use protected or review-only API endpoints. For a persistent hosting disk, set `ICMT_DATABASE_PATH` to the mounted database location.

For production, upload the already-created `backend/icmt.db` to the service's persistent disk before making the public site point to that API. Do not add either `backend/icmt.db` or `backend/seed/member-data.js` to Git.

## Key Features & Design System

- **Design Reference**: Inspired by the structure and branding of ICMT (`https://sites.google.com/view/icmtmembers/home`), built as a 100% native frontend implementation.
- **Typography & Theme**: Google Font `Lato` (300, 400, 700) with deep teal (`#1e6c93`), dark navy (`#004d66`), and light accent (`#eaf5fb`).
- **Data Integrity**: Preserves all 343 verified member records and embedded portraits without modification.
- **Live Sync**: Edits made in the Admin Member Management workspace automatically sync to public directory pages in real time via reactive `localStorage`.
- **GitHub Pages Ready**: Structured with root relative links for immediate zero-config deployment.
