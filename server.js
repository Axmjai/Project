// backend/chat-server.js (ตัวอย่างชื่อไฟล์)
// เซิร์ฟเวอร์ฝั่ง Node.js เอาไว้คุยกับ Gemini 2.5 Flash เรื่อง "งู" โดยเฉพาะ

import 'dotenv/config'
import express from 'express'
import cors from 'cors'

// -------------------------------
// 1) สร้างแอป Express + ตั้งค่าเบื้องต้น
// -------------------------------
const app = express()

app.use(cors())          // อนุญาตให้ frontend ต่าง origin (เช่น Flutter Web / เว็บอื่น) ยิงมาได้
app.use(express.json())  // ให้ express อ่าน body ที่เป็น JSON ได้ (req.body)

// -------------------------------
// 2) เช็คว่ามี GEMINI_API_KEY ใน .env ไหม
// -------------------------------
// ถ้าไม่มี ให้หยุดโปรแกรมทันที (กันลืมใส่ key แล้วงงว่าทำไมเรียก API ไม่ได้)
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ ไม่พบ GEMINI_API_KEY ในไฟล์ .env')
  process.exit(1)
}

// -------------------------------
// 3) ตั้งค่าคงที่ของ Google Gemini API
// -------------------------------
const API_ROOT = 'https://generativelanguage.googleapis.com/v1'

// ✅ ใช้โมเดลเดียวเลย: gemini-2.5-flash (เวอร์ชันใหม่ + ฟรี tier)
// ไม่ต้องเลือกหลายตัวให้สับสน
const MODEL_NAME = 'gemini-2.5-flash'

// -------------------------------
// 4) กติกาของบอท (System prompt)
// -------------------------------
// ข้อความนี้จะถูกส่งไปพร้อมคำถามผู้ใช้ทุกครั้ง
// เพื่อบอกให้โมเดลรู้ว่า "บอทนี้ตอบได้แค่เรื่องงู"
const SYSTEM_RULES = `
คุณเป็นผู้ช่วยเฉพาะทางเรื่อง "งู" (ชนิดงู, พิษงู, การปฐมพยาบาลเมื่อถูกงูกัด)
- ตอบเฉพาะเรื่องที่เกี่ยวกับงูเท่านั้น
- ถ้าคำถามอยู่นอกขอบเขต ให้ตอบว่า "ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น"
- ตอบเป็นภาษาไทย ให้เข้าใจง่าย กระชับ และข้อมูลถูกต้อง
`.trim()

// -------------------------------
// 5) ฟังก์ชันช่วย: เช็คว่าคำถาม "เกี่ยวกับงู" ไหม
// -------------------------------
// ถ้าไม่เกี่ยว จะไม่เรียก API (ประหยัด quota + ป้องกันบอทตอบเรื่องอื่น)
function isSnakeDomain(text = '') {
  const t = String(text).toLowerCase()

  const kws = [
    // ไทย
    'งู', 'งูมีพิษ', 'งูไม่มีพิษ', 'พิษงู', 'โดนงูกัด', 'ถูกงูกัด',
    'ปฐมพยาบาลงู', 'สายพันธุ์งู', 'ชนิดงู',
    'งูเห่า', 'งูจงอาง', 'งูสามเหลี่ยม', 'งูกะปะ',
    'งูเขียวหางไหม้', 'งูทางมะพร้าว', 'งูเหลือม', 'งูหลาม',
    'เขี้ยวงู', 'เซรุ่ม', 'พิษประสาท', 'พิษเลือด', 'พิษกล้ามเนื้อ',
    // อังกฤษ
    'snake', 'snakes', 'snakebite', 'venom', 'antivenom',
    'cobra', 'king cobra', 'krait', 'viper', 'pit viper'
  ]

  // ถ้าข้อความมีคำใดคำหนึ่งใน kws -> ถือว่าเกี่ยวกับงู
  return kws.some(k => t.includes(k))
}

// -------------------------------
// 7) POST /chat
// route หลักที่ frontend (Flutter) จะเรียก
// รับ JSON: { "message": "ข้อความจากผู้ใช้" }
// ตอบ JSON: { "answer": "คำตอบจากบอท" }
// -------------------------------
app.post('/chat', async (req, res) => {
  try {
    // 7.1) ดึง message จาก body แล้ว trim ช่องว่างหัวท้าย
    const user = (req.body?.message || '').toString().trim()

    // ถ้าไม่มี message -> ส่ง 400 บอกว่าขาดพารามิเตอร์
    if (!user) {
      return res.status(400).json({ error: 'message is required' })
    }

    // 7.2) ถ้าไม่ใช่คำถามเกี่ยวกับงู -> ตอบเองเลย ไม่เรียก Gemini
    if (!isSnakeDomain(user)) {
      return res.json({
        answer: 'ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น',
      })
    }

    // 7.3) สร้าง payload ที่จะส่งให้ Gemini
    // เราส่ง SYSTEM_RULES + คำถามผู้ใช้ไปรวมกันในข้อความเดียว
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${SYSTEM_RULES}\n\nคำถามผู้ใช้: ${user}`,
            },
          ],
        },
      ],
    }

    // 7.4) ยิงไปที่ endpoint generateContent ของโมเดลที่เลือก (gemini-2.5-flash)
    const url = `${API_ROOT}/models/${MODEL_NAME}:generateContent?key=${process.env.GEMINI_API_KEY}`

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const j = await r.json()

    // ถ้า status ไม่โอเค เช่น 4xx / 5xx -> ส่ง error กลับให้ frontend ดู
    if (!r.ok) {
      console.error('Gemini API error:', j)
      return res.status(r.status).json({ error: j })
    }

    // 7.5) ดึงข้อความคำตอบจากโครงสร้าง response
    // โครง: candidates[0].content.parts[].text
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text)
        .join('') || 'ขออภัย ไม่พบคำตอบที่ชัดเจน'

    // ส่งกลับให้ frontend ในฟิลด์ answer
    res.json({ answer: text })
  } catch (e) {
    // 7.6) ถ้าโค้ตฝั่งเราเองพัง เช่น fetch throw error
    console.error('Gemini error:', e)
    res
      .status(500)
      .json({ error: { status: 500, message: 'Server error' } })
  }
})

// -------------------------------
// 8) เริ่มรันเซิร์ฟเวอร์
// -------------------------------
// ถ้าใน .env มี PORT ก็ใช้ตามนั้น
// ถ้าไม่มี ใช้ค่า default = 3000
const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`✅ Using model: ${MODEL_NAME}`)
  console.log(`✅ Server running on http://localhost:${port}`)
})
