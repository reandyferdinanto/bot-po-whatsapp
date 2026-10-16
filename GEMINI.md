# Bot PO WhatsApp — System Context & Operating Rules

## Overview
`bot-po-whatsapp` is an automated Procurement Assistant system integrating WhatsApp (via OpenWA Gateway), Google Sheets API v4, PostgreSQL, AI/OCR document parsing (Gemini Flash Vision + local Tesseract.js), and a React Vite web dashboard.

## System Topology & Ports
- **Node.js Server**: Port `3001` (Managed by PM2 process `bot-po`)
- **Nginx Reverse Proxy**: `https://bot-whatsapp.ebite.biz.id` -> `http://127.0.0.1:3001` (SSL Let's Encrypt, 50M client_max_body_size)
- **OpenWA Gateway**: `https://openwa.ebite.biz.id` (Session ID: `997f4002-105`)
- **PostgreSQL**: Port `5432`, Database: `bot_po`
- **Spreadsheet Target**: `15n9joeQAoic8FvP5V_-bChqjHKjFeMG0WGHzQ4xHGPk`
  - Active Tab: `PO 2026` (23 columns, A-W)
  - Master Tabs: `database Material`, `database Supplier Mat.`

## Architecture & Codebase Map
- `src/server.js`: Express app, CORS, health endpoint (`/health`), static serving of `client/dist`.
- `src/config/env.js`: Environment configuration loader (`.env`).
- `src/config/googleAuth.js`: OAuth2 client management (`credentials/client_secret.json`, `credentials/token.json`).
- `src/handlers/webhookHandler.js`: Receives incoming WhatsApp messages from OpenWA, verifies whitelist and HMAC.
- `src/handlers/conversationManager.js`: Interactive multi-step conversation state machine per WhatsApp chat ID.
- `src/handlers/commandHandler.js`: Direct WhatsApp command processor (`/help`, `/menu`, `/kurs`, `/cari`, `/supplier`, `/cekpo`, `/batalpo`, `/sync`).
- `src/handlers/mediaHandler.js`: Handles image/PDF uploads from WhatsApp, triggers OCR & auto-classification.
- `src/services/sheetsService.js`: Google Sheets API v4 CRUD operations (append multi-item, search, patch, soft delete).
- `src/services/cacheService.js`: In-memory cache + Fuse.js fuzzy matching + PostgreSQL sync.
- `src/services/dbService.js`: PostgreSQL local client for fast indexing (<5ms queries).
- `src/services/cronService.js`: Background cron syncing Google Sheets every 30 minutes.
- `src/services/kursService.js`: Scrapes and caches Bank Indonesia USD exchange rates from Ortax.
- `src/services/geminiVisionService.js`: Multimodal extraction of PO & Delivery Notes using Gemini 1.5 Flash Vision.
- `src/services/ocrService.js`: Local fallback OCR using Tesseract.js + `pdf-parse` + Sharp image preprocessing.
- `src/routes/apiRoutes.js`: REST API for the web dashboard (`/api/stats`, `/api/pos`, `/api/materials`, `/api/suppliers`, `/api/ocr/parse`, `/api/ocr/batch-commit`, `/api/kurs/usd`).
- `client/`: React 18 + Vite + Ant Design single-page dashboard. Built output is served from `client/dist`.

## WhatsApp Commands Cheatsheet
- `/help` or `/bantuan`: List of all available commands.
- `/menu` or `/start`: Open 4-option interactive menu.
- `/kurs` or `/usd`: Current Bank Indonesia middle exchange rate with trend indicator.
- `/cari <nama/kode>`: Search material master & recommend primary vendor with historical price range.
- `/supplier <nama_vendor>`: View complete order history and items supplied by a vendor.
- `/cekpo <no_po>`: Fetch PO details, line items, GRPO status, payment status, and grand total.
- `/batalpo <no_po> [alasan]`: Soft delete PO by setting status to `CANCELLED` with timestamp and reason.
- `/sync`: Manually trigger master data synchronization from Google Sheets.

## Operational Constraints & Rules
1. **PM2 Process Management**:
   - The production app runs under PM2 name `bot-po`.
   - Never kill or start duplicate node processes directly on port 3001. Always use `pm2 restart bot-po` or `pm2 reload bot-po`.
2. **Dashboard Rebuilds**:
   - If changes are made to `client/src/`, always run `npm run build:client` (or `cd client && npm run build`) so `client/dist` is updated.
3. **Storage Rules**:
   - Persistent data, code, credentials, and databases MUST remain in `/home/reandynad/` (Root OS disk `/`).
   - NEVER store application data, database files, or uploads in `/mnt` (Azure ephemeral temporary disk that wipes on deallocation).
4. **Google Credentials**:
   - OAuth credentials are in `credentials/client_secret.json` and tokens in `credentials/token.json`.
   - If token expires or shows auth errors, run `node auth-google.js` (or `npm run auth`).
