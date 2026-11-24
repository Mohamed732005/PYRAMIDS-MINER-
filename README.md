# PYRAMIDS MINER

## Files
- `index.html`: Telegram Mini App.
- `api/[...path].js`: Vercel serverless API. Verifies Telegram `initData` on the server.
- `public/coin.png`: your Pyramids Coin image.
- `schema.sql`: database setup.

## Deploy
1. Create a Neon PostgreSQL database.
2. Run all SQL in `schema.sql` in the Neon SQL Editor.
3. Upload this folder to a GitHub repository and import it into Vercel.
4. In Vercel > Project > Settings > Environment Variables add:
   - `DATABASE_URL`: Neon connection string
   - `BOT_TOKEN`: your Telegram bot token (secret; never put it in HTML)
   - `ADMIN_ID`: `1229348216`
5. Redeploy after adding variables.
6. Set the Mini App URL in BotFather / your bot menu button to the deployed Vercel URL.

Mining is calculated from server timestamps, so it accrues while the user has closed Telegram. It is capped by `daily_cap` per rolling accumulation period. Admin can change mining rate and cap from the in-app Admin tab.

Important: This starter project implements persistent mining, secure Telegram authentication, claim, and admin rate/cap controls. Other legacy SHIFO features (withdrawals, ads, bounty approvals, referrals, wallet connection) are not carried over into this secure backend build yet. Do not advertise coin value or promise withdrawals unless you implement and fund those systems.
