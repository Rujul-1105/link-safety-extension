<div align="center">
  <h1>🛡️ NetGuard Pro</h1>
  <p><b>Real-Time, ML-Powered URL Threat Detection & Link Safety Extension</b></p>

  [![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](#)
  [![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](#)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](#)
  [![Redis](https://img.shields.io/badge/Redis-Caching-DC382D?style=for-the-badge&logo=redis&logoColor=white)](#)
</div>

---

Welcome to **NetGuard Pro**! Ever clicked a link and immediately regretted it? NetGuard Pro is here to make sure that never happens again. It acts as an invisible bodyguard for your browser, evaluating every single link you visit in **real-time** using a combination of machine learning heuristics, deep network analysis, and third-party threat intelligence like VirusTotal.

If a site is sketchy, NetGuard knows before you even finish loading the page. 🚨

---

## ✨ Supercharged Features

- **Zero-Latency Feel:** Caches results in Redis and Chrome Local Storage. Safe sites load instantly without waiting for a re-scan.
- **Ensemble ML Heuristics:** Calculates a real-time risk score (0-100) based on domain entropy, IP masking, phishing keyword detection, and more.
- **Deep Network Analysis:** Checks TLS certificate validity, DNS-over-HTTPS (DoH) records for botnet fast-fluxing, and WHOIS domain registration age.
- **VirusTotal Integration:** Cross-references URLs against dozens of industry-leading security engines simultaneously.
- **WebSockets Magic:** Uses BullMQ for asynchronous heavy-lifting on the backend and pushes the final threat score straight to your browser badge via Socket.io.

---

## 🏗️ The Architecture 

NetGuard Pro is split into two powerhouses:

### 🌐 1. The Chrome Extension (`/extension`)
A sleek Manifest V3 extension built on **React** and **Vite** with blazing-fast **Tailwind CSS**.
- **The Brains:** A background Service Worker intercepts your navigation, authenticates your device, and talks to the backend.
- **The Looks:** A dynamic toolbar badge updates in real-time, flashing red 🟥 when danger is detected.

### ⚙️ 2. The Node.js Backend (`/backend`)
A high-performance **Express.js** REST API designed for scale.
- **Data Persistence:** **PostgreSQL** handled smoothly via the **Prisma ORM**.
- **Task Queues:** **BullMQ** running on **Redis** handles the heavy scanning workloads so the API never blocks.
- **Live Updates:** **Socket.io** pushes results down to the extension the exact millisecond a scan finishes.

---

## Get It Running Locally

Want to take NetGuard Pro for a spin? Follow these steps to set up your local development environment.

### Prerequisites
- **Node.js** (v18+)
- **PostgreSQL** (running locally or via Docker)
- **Redis** (running locally on port `6379`)

### Part 1: Booting up the Backend

1. **Enter the backend directory:**
   ```bash
   cd backend
   ```
2. **Install the dependencies:**
   ```bash
   npm install
   ```
3. **Configure your environment:**
   Create a `.env` file in the `backend` folder and add your secrets:
   ```env
   PORT=3001
   NODE_ENV=development
   JWT_SECRET=make_up_a_super_secret_string
   DATABASE_URL="postgresql://user:password@localhost:5432/netguard"
   REDIS_URL="redis://localhost:6379"
   VIRUSTOTAL_API_KEY=your_virustotal_api_key_here
   ```
4. **Sync the Database:**
   Push the Prisma schema to your PostgreSQL database:
   ```bash
   npx prisma db push
   ```
5. **Ignition! 🚀**
   Start the backend server (it will automatically start the BullMQ worker and WebSockets):
   ```bash
   npm run dev
   ```

### Part 2: Firing up the Extension

1. **Enter the extension directory:**
   ```bash
   cd ../extension
   ```
2. **Install the dependencies:**
   ```bash
   npm install
   ```
3. **Start the Vite compiler:**
   ```bash
   npm run dev
   ```
   *(This continually builds your extension into a `dist/` folder on every file save!)*

### Part 3: Install it in Chrome

1. Open Google Chrome and type `chrome://extensions/` in the URL bar.
2. Toggle **Developer mode** ON (top right corner).
3. Click the **"Load unpacked"** button.
4. Navigate to your project folder and select the `extension/dist` directory.
5. **Boom! 💥** NetGuard Pro is installed. Pin it to your toolbar and watch it work its magic as you browse!

---

## 🧬 Life Cycle of a Scan (How the Magic Happens)

Ever wonder what happens in the milliseconds between clicking a link and the badge updating? 

1. **Device Auth:** On install, the extension silently registers with the backend and receives a secure JWT Device Token.
2. **Interception:** You visit a URL. The background service worker catches it immediately.
3. **Cache Check:** The extension checks Chrome Local Storage. If it's a recent scan, it loads it instantly!
4. **API Call:** If it's a new URL, the extension POSTs it to the backend.
5. **Redis Fast-Lane:** The backend checks Redis. If another user recently scanned this site, boom—instant response.
6. **Heavy Lifting:** Total cache miss? The backend tosses the URL into a **BullMQ** queue and tells the extension `{"status": "queued"}`. The extension shows a scanning `...` badge.
7. **The Gauntlet:** The worker analyzes the URL entropy, queries RDAP for domain age, verifies the TLS issuer, checks DNS botnet flags, and pings VirusTotal.
8. **The Score:** An ensemble algorithm weights all these signals and calculates a final threat score (0-100).
9. **The Push:** The backend beams the result directly to your specific browser tab via **WebSockets**. 
10. **Stay Safe:** The badge snaps to the final score. If it's above 60, you get a blaring system notification to back away immediately!

---

<div align="center">
  <i>Stay safe out there! Built with ❤️ to keep the web secure.</i>
</div>
