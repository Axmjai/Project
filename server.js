// server.mjs (ESM) หรือ index.mjs
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in .env');
  process.exit(1);
}

// --------- Gemini client ----------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// รุ่นที่แนะนำ + เผื่อ fallback
const PREFERRED_MODEL = 'gemini-1.5-flash-latest';
const FALLBACK_MODELS = ['gemini-1.5-flash-001', 'gemini-1.5-pro-latest'];

function getModel(name) {
  return genAI.getGenerativeModel({ model: name });
}

// --------- Guardrails ----------
const SYSTEM_RULES = `
คุณเป็นผู้ช่วยเฉพาะทางเรื่อง "งู" (ชนิด/พิษ/ปฐมพยาบาล)
กติกา:
- ตอบเฉพาะเรื่องที่เกี่ยวกับงู
- ถ้าอยู่นอกขอบเขต ให้ตอบว่า "ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น"
- ตอบภาษาไทย กระชับ ถูกต้อง
`.trim();

function isSnakeDomain(text = '') {
  const t = String(text).toLowerCase();
  const kws = [
    'งู','งูมีพิษ','งูไม่มีพิษ','พิษงู','โดนงูกัด','ปฐมพยาบาลงู',
    'สายพันธุ์งู','ชนิดงู','งูเห่า','งูจงอาง','งูสามเหลี่ยม',
    'งูกะปะ','งูเขียวหางไหม้','งูทางมะพร้าว','งูเหลือม','งูหลาม',
    'เขี้ยวงู','เซรุ่ม','เซรุ่มต้านพิษงู','พิษประสาท','พิษเลือด','พิษกล้ามเนื้อ',
    'snake','venom','envenomation','antivenom','fang','cobra','krait','viper','pit viper'
  ];
  return kws.some(k => t.includes(k));
}

// --------- Helpers ----------
async function askGeminiWithFallback(prompt) {
  // ลองรุ่นหลักก่อน แล้วค่อยสลับ fallback ทีละตัวเมื่อโดน 404/ไม่รองรับ
  const tryModels = [PREFERRED_MODEL, ...FALLBACK_MODELS];

  let lastErr;
  for (const name of tryModels) {
    try {
      const model = getModel(name);
      // ส่งเป็นสตริงตรง ๆ ได้ใน SDK รุ่นใหม่
      const result = await model.generateContent(prompt);
      const text = (result?.response?.text?.() ?? '').trim();
      if (text) return { model: name, text };
      // กันเคสได้ response ว่าง
      lastErr = new Error('Empty response text');
    } catch (e) {
      lastErr = e;
      // ถ้าเป็น 404/ v1beta not found ก็วนไปลองตัวถัดไป
      const msg = String(e?.message || e);
      const status = e?.status ?? 0;
      if (status === 404 || msg.includes('v1beta') || msg.includes('not found')) {
        continue;
      } else {
        break; // error อื่น ๆ ไม่ต้องลองต่อ
      }
    }
  }
  throw lastErr || new Error('No model produced a valid answer');
}

// --------- Routes ----------
app.get('/health', (_, res) => res.json({ ok: true }));

// ดูว่า key นี้มองเห็นโมเดลอะไรบ้างจริง ๆ
app.get('/models', async (_req, res) => {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`
    );
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/chat', async (req, res) => {
  try {
    const user = (req.body?.message || '').toString().trim();
    if (!user) return res.status(400).json({ error: 'message is required' });

    if (!isSnakeDomain(user)) {
      return res.json({ answer: 'ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น' });
    }

    const prompt = `${SYSTEM_RULES}\n\nคำถามผู้ใช้: ${user}`;

    const { model: usedModel, text } = await askGeminiWithFallback(prompt);

    return res.json({ answer: text, model: usedModel });
  } catch (e) {
    console.error('Gemini error:', e);
    const status = e?.status || 500;
    const message = e?.message || 'Server error';
    return res.status(status).json({ error: { status, message } });
  }
});

// --------- Start ----------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Gemini API server running on http://localhost:${port}`);
});
