import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json());

// ตรวจคีย์ก่อน
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in .env');
  process.exit(1);
}

// สร้าง client Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// กติกา
const SYSTEM_RULES = `
คุณเป็นผู้ช่วยเฉพาะทางเรื่อง "งู" (ชนิด/พิษ/ปฐมพยาบาล)
กติกา:
- ตอบเฉพาะเรื่องที่เกี่ยวกับงู
- ถ้าอยู่นอกขอบเขต ให้ตอบว่า "ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น"
- ตอบภาษาไทย กระชับ ถูกต้อง
`.trim();

// ฟังก์ชันเช็คว่าถามเรื่องงูจริงไหม
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

// Endpoint หลัก
app.post('/chat', async (req, res) => {
  try {
    const user = (req.body?.message || '').toString().trim();
    if (!user) return res.status(400).json({ error: 'message is required' });

    // ถ้าไม่ใช่เรื่องงู → ตอบปฏิเสธ
    if (!isSnakeDomain(user)) {
      return res.json({ answer: 'ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น' });
    }

    const prompt = `${SYSTEM_RULES}\n\nคำถามผู้ใช้: ${user}`;
    const result = await model.generateContent(prompt);

    // ✅ วิธีที่ถูกต้องในการดึงข้อความจาก Gemini
    const text = result.response.text() || 'ขออภัย ไม่พบคำตอบที่ชัดเจน';

    return res.json({ answer: text });
  } catch (e) {
    console.error('Gemini error:', e);
    const status = e?.status || 500;
    const message = e?.message || 'Server error';
    return res.status(status).json({ error: { status, message } });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`✅ Gemini API server running on http://localhost:${port}`)
);
