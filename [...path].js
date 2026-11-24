import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

const sql = neon(process.env.DATABASE_URL);
const ADMIN_ID = String(process.env.ADMIN_ID || "");
const BOT_TOKEN = process.env.BOT_TOKEN || "";

function verifyInitData(initData) {
  if (!initData || !BOT_TOKEN) throw new Error("Open the Mini App from Telegram.");
  const p = new URLSearchParams(initData);
  const hash = p.get("hash"); p.delete("hash");
  if (!hash) throw new Error("Invalid Telegram login data.");
  const dataCheck = [...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
  const calc = crypto.createHmac("sha256",secret).update(dataCheck).digest("hex");
  const a=Buffer.from(calc,"hex"), b=Buffer.from(hash,"hex");
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) throw new Error("Telegram authentication failed.");
  const authDate=Number(p.get("auth_date")||0);
  if(!authDate || Date.now()/1000-authDate>86400) throw new Error("Telegram session expired. Reopen the Mini App.");
  const u=JSON.parse(p.get("user")||"{}");
  if(!u.id) throw new Error("Telegram user ID missing.");
  return u;
}
async function ensure(user){
  await sql`INSERT INTO users (telegram_id, username, first_name) VALUES (${String(user.id)}, ${user.username||null}, ${user.first_name||null}) ON CONFLICT (telegram_id) DO NOTHING`;
  await sql`UPDATE users SET username=${user.username||null}, first_name=${user.first_name||null} WHERE telegram_id=${String(user.id)}`;
  const settings=await sql`SELECT mining_rate,daily_cap FROM settings WHERE id=1`;
  const cfg=settings[0]||{mining_rate:500,daily_cap:500};
  await sql`WITH calc AS (
    SELECT telegram_id,
      CASE WHEN day_started_at < date_trunc('day', NOW()) THEN 0 ELSE earned_today END AS earned,
      CASE WHEN day_started_at < date_trunc('day', NOW()) THEN date_trunc('day', NOW()) ELSE day_started_at END AS day_start,
      GREATEST(0, EXTRACT(EPOCH FROM (NOW()-last_update))/86400 * ${Number(cfg.mining_rate)}) AS raw_add
    FROM users WHERE telegram_id=${String(user.id)}
  )
  UPDATE users u SET
    pending = u.pending + LEAST(GREATEST(0, ${Number(cfg.daily_cap)} - calc.earned), calc.raw_add),
    earned_today = calc.earned + LEAST(GREATEST(0, ${Number(cfg.daily_cap)} - calc.earned), calc.raw_add),
    day_started_at = calc.day_start,
    last_update = NOW()
  FROM calc WHERE u.telegram_id=calc.telegram_id`;
  const rows=await sql`SELECT balance,pending FROM users WHERE telegram_id=${String(user.id)}`;
  return {balance:Number(rows[0].balance),pending:Number(rows[0].pending),rate:Number(cfg.mining_rate),dailyCap:Number(cfg.daily_cap),isAdmin:String(user.id)===ADMIN_ID};
}
function send(res,status,obj){res.status(status).json(obj)}
export default async function handler(req,res){
  try{
    const path=(req.url||"").split("?")[0].replace(/^\/api\/?/,"");
    const user=verifyInitData(req.headers["x-telegram-init-data"]);
    if(path==="state" && req.method==="GET") return send(res,200,await ensure(user));
    if(path==="claim" && req.method==="POST"){
      await ensure(user);
      const rows=await sql`UPDATE users SET balance=balance+pending,pending=0 WHERE telegram_id=${String(user.id)} RETURNING balance,pending`;
      const s=await ensure(user);
      return send(res,200,{...s,balance:Number(rows[0].balance),pending:Number(rows[0].pending)});
    }
    if(path==="admin/settings" && req.method==="POST"){
      if(String(user.id)!==ADMIN_ID || !ADMIN_ID) return send(res,403,{error:"Admin access denied."});
      const rate=Number(req.body?.rate), cap=Number(req.body?.dailyCap);
      if(!Number.isFinite(rate)||!Number.isFinite(cap)||rate<0||cap<0||rate>1e8||cap>1e8) return send(res,400,{error:"Enter valid non-negative values."});
      await sql`UPDATE settings SET mining_rate=${rate},daily_cap=${cap},updated_at=NOW() WHERE id=1`;
      return send(res,200,await ensure(user));
    }
    return send(res,404,{error:"API route not found."});
  }catch(e){return send(res,400,{error:e.message||"Server error."});}
}