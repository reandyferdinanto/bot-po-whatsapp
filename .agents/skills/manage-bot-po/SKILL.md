---
name: manage-bot-po
description: >-
  Use this skill to manage, operate, restart, build, deploy, sync, or troubleshoot the bot-po-whatsapp application.
---

# Managing bot-po-whatsapp

This runbook covers operational tasks for the `bot-po-whatsapp` service.

## 1. Service Control (PM2)
- Check status: `pm2 status bot-po`
- View live logs: `pm2 logs bot-po --lines 50`
- Restart server: `pm2 restart bot-po`
- Reload zero-downtime: `pm2 reload bot-po`

## 2. Rebuilding the Frontend Dashboard
When updating code in `client/`:
```bash
cd /home/reandynad/bot-po-whatsapp
npm run build:client
pm2 restart bot-po
```
Verify the dashboard loads at `https://bot-whatsapp.ebite.biz.id`.

## 3. Re-authorizing Google Sheets OAuth2
If Google Sheets API fails with 401/invalid_grant:
```bash
cd /home/reandynad/bot-po-whatsapp
npm run auth
```
Follow the console prompt to visit the Google consent URL, paste the authorization code, and generate a fresh `credentials/token.json`. Then restart `pm2 restart bot-po`.

## 4. Multi-Year Historical Sync
To sync all transaction sheets (PO 2024, PO 2025, PO 2026) to PostgreSQL:
```bash
npm run sync:all
```

## 5. Health Checks & Verification
- Check API health: `curl -s http://localhost:3001/health | jq`
- Test Nginx SSL proxy: `curl -s https://bot-whatsapp.ebite.biz.id/health | jq`
- Verify OpenWA connection: Ensure `openwaSession` returns `997f4002-105`.
