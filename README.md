<div align="center">
  <h1>🏢 AssetFlow</h1>
  <p><strong>Intelligent Enterprise Asset & Resource Management</strong></p>
  <p><i>Developed for the Odoo Hackathon</i></p>
</div>

<hr />

## 🌟 Overview

Managing physical and digital assets across a growing organization can quickly become chaotic. **AssetFlow** is a comprehensive, centralized platform built to solve the modern asset management crisis. From tracking hardware lifecycle to managing inter-departmental transfers and scheduling maintenance, AssetFlow gives your organization complete visibility and control over its resources.

Whether you're allocating high-end electronics to engineers, booking temporary projectors for a presentation, or running a company-wide physical audit, AssetFlow handles it all in a single, intuitive interface.

---

## 🚀 Key Features

### 📦 Complete Asset Lifecycle Management
- **Centralized Directory**: A single source of truth for all assets, detailing acquisition dates, retirement thresholds, current status, and assignments.
- **Dynamic Status Tracking**: Assets automatically transition between `Available`, `Allocated`, `Reserved`, `UnderMaintenance`, `Retired`, and `Lost`.

### 🔄 Intelligent Allocations & Transfers
- **Seamless Hand-offs**: Assign assets directly to individuals or entire departments.
- **Approval Workflows**: Built-in transfer requests ensure that assets don't change hands without authorization from an Asset Manager or Admin.

### 🛠️ Kanban Maintenance Board
- **Drag-and-Drop Workflow**: Track repairs visually through `Reported`, `In Progress`, and `Resolved` states.
- **Preventative Alerts**: Automated warnings for assets nearing their next scheduled service date.

### 📅 Resource Booking
- **Time-bound Reservations**: Allow employees to temporarily checkout shared resources (like company vehicles or specialized tools) without permanently transferring ownership.

### 📋 Automated Audit Cycles
- **Effortless Auditing**: Create location-based or department-based audit scopes. 
- **Discrepancy Reporting**: Automatically flags missing or damaged assets during an audit and generates detailed discrepancy reports when the cycle is closed.

### 📊 Real-Time Analytics
- **Utilization Metrics**: Visualize department-level asset utilization scores.
- **Actionable Insights**: Instantly identify your most used assets, idle equipment, and hardware nearing its retirement age.

---

## 🛠️ Technology Stack

AssetFlow is built with a modern, serverless architecture focusing on speed, reactivity, and real-time data sync.

- **Frontend**: [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: Custom CSS (Dark-mode optimized, glassmorphism design system)
- **Backend & Database**: [Firebase Firestore](https://firebase.google.com/docs/firestore) (NoSQL Real-time Database)
- **Authentication**: Firebase Auth (Role-based Access Control)

---

## 🔒 Role-Based Access Control (RBAC)

Security and accountability are paramount. AssetFlow enforces strict RBAC at the component and database level:

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access. Can modify roles, force-approve transfers, and edit core metadata. |
| **Asset Manager** | Can approve transfers, close audits, transition maintenance tickets, and edit assets. |
| **Department Head** | Can view department utilization and approve transfers involving their department. |
| **Employee** | Can view their allocated assets, request transfers, and book temporary resources. |

---

## 💻 Local Setup & Installation

Follow these steps to run AssetFlow locally on your machine.

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v16 or higher)
- A Firebase Project with Firestore and Authentication enabled.

### 1. Clone & Install
```bash
# Clone the repository
git clone https://github.com/dipesh-23/odoo-hackathon.git

# Navigate into the directory
cd odoo-hackathon

# Install NPM dependencies
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and populate it with your Firebase project credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

### 3. Run the Development Server
```bash
npm run dev
```
Navigate to `http://localhost:5173` in your browser to view the application.

---

## 📂 Project Structure

```text
src/
├── assets/          # Static assets (images, icons)
├── components/      # Reusable UI components (Modals, Navbars)
├── context/         # React Context providers (AuthContext)
├── pages/           # Main route views (Dashboard, Audit, Reports, etc.)
├── services/        # Firebase data access layer & business logic
├── utils/           # Helper functions (RBAC checks, formatting)
├── App.jsx          # Root component and Routing
├── firebase.js      # Firebase initialization
└── index.css        # Global styles and design system tokens
```
