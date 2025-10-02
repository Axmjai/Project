import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in .env');
  process.exit(1);
}

// กติกา + ฟิลเตอร์เฉพาะโดเมน "งู"
const SYSTEM_RULES = `
คุณเป็นผู้ช่วยเฉพาะทางเรื่อง "งู" (ชนิด/พิษ/ปฐมพยาบาล)
- ตอบเฉพาะเรื่องที่เกี่ยวกับงู
- ถ้าอยู่นอกขอบเขต ให้ตอบว่า "ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น"
- ตอบภาษาไทย กระชับ ถูกต้อง
`.trim();

function isSnakeDomain(text = '') {
  const t = String(text).toLowerCase();
  const kws = [
    'งู','งูมีพิษ','งูไม่มีพิษ','พิษงู','โดนงูกัด','ปฐมพยาบาลงู',
    'สายพันธุ์งู','ชนิดงู','งูเห่า','งูจงอาง','งูสามเหลี่ยม','งูกะปะ',
    'งูเขียวหางไหม้','งูทางมะพร้าว','งูเหลือม','งูหลาม','เขี้ยวงู',
    'เซรุ่ม','เซรุ่มต้านพิษงู','พิษประสาท','พิษเลือด','พิษกล้ามเนื้อ',
    'snake','venom','envenomation','antivenom','fang','cobra','krait','viper','pit viper'
  ];
  return kws.some(k => t.includes(k));
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
//const API_ROOT = 'https://generativelanguage.googleapis.com/v1';
//const MODELs = process.env.GEMINI_MODEL || 'gemini-1.5-flash'; // หรือ 'gemini-1.5-flash'
const MODEL = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
app.get('/models', async (_req, res) => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`);
  res.status(r.status).json(await r.json());
});

app.post('/chat', async (req, res) => {
  try {
    const user = (req.body?.message || '').toString().trim();
    if (!user) return res.status(400).json({ error: 'message is required' });

    if (!isSnakeDomain(user)) {
      return res.json({ answer: 'ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น' });
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${SYSTEM_RULES}\n\nคำถามผู้ใช้: ${user}` }]
        }
      ]
    };

    const r = await fetch(
      `${API_ROOT}/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );

    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: j });

    const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ||
                 'ขออภัย ไม่พบคำตอบที่ชัดเจน';
    res.json({ answer: text });
  } catch (e) {
    console.error('Gemini error:', e);
    res.status(500).json({ error: { status: 500, message: 'Server error' } });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`✅ Gemini API server running on http://localhost:${port}`)
);
