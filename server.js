import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found')
  process.exit(1)
}

const API_ROOT = 'https://generativelanguage.googleapis.com/v1'

// ใส่ที่อยากใช้ได้ แต่จะถูก validate อีกที
const PREFERRED_MODELS = [
  process.env.GEMINI_MODEL,       // ถ้าตั้งมาใน ENV
  'gemini-1.5-pro',               // โปร
  'gemini-1.5-flash',             // เร็ว/ประหยัด
].filter(Boolean)

let ACTIVE_MODEL = 'gemini-1.5-flash' // ดีฟอลต์

async function pickUsableModel() {
  const r = await fetch(`${API_ROOT}/models?key=${process.env.GEMINI_API_KEY}`)
  const j = await r.json()
  if (!r.ok) {
    console.error('⚠️ list models failed:', j)
    return
  }
  const names = (j.models || []).map(m => m.name.replace('models/', ''))
  // เลือกตัวแรกใน PREFERRED_MODELS ที่อยู่ในลิสต์
  const found = PREFERRED_MODELS.find(m => names.includes(m))
  ACTIVE_MODEL = found || (names.includes('gemini-1.5-flash') ? 'gemini-1.5-flash' : names[0])
  console.log('✅ Using model:', ACTIVE_MODEL)
}

// บูตแล้วเลือกโมเดลให้เรียบร้อย
await pickUsableModel()

app.get('/models', async (_req, res) => {
  const r = await fetch(`${API_ROOT}/models?key=${process.env.GEMINI_API_KEY}`)
  res.status(r.status).json(await r.json())
})

const SYSTEM_RULES = `
คุณเป็นผู้ช่วยเฉพาะทางเรื่อง "งู" (ชนิด/พิษ/ปฐมพยาบาล)
- ตอบเฉพาะเรื่องที่เกี่ยวกับงู
- ถ้าอยู่นอกขอบเขต ให้ตอบว่า "ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น"
- ตอบภาษาไทย กระชับ ถูกต้อง
`.trim()

function isSnakeDomain(text = '') {
  const t = String(text).toLowerCase()
  const kws = ['งู','งูมีพิษ','งูไม่มีพิษ','พิษงู','โดนงูกัด','ปฐมพยาบาลงู',
    'สายพันธุ์งู','ชนิดงู','งูเห่า','งูจงอาง','งูสามเหลี่ยม','งูกะปะ',
    'งูเขียวหางไหม้','งูทางมะพร้าว','งูเหลือม','งูหลาม','เขี้ยวงู',
    'เซรุ่ม','พิษประสาท','พิษเลือด','พิษกล้ามเนื้อ',
    'snake','venom','antivenom','cobra','krait','viper','pit viper']
  return kws.some(k => t.includes(k))
}

app.post('/chat', async (req, res) => {
  try {
    const user = (req.body?.message || '').toString().trim()
    if (!user) return res.status(400).json({ error: 'message is required' })

    if (!isSnakeDomain(user)) {
      return res.json({ answer: 'ขออภัย บอทนี้ตอบเฉพาะเรื่องงูเท่านั้น' })
    }

    const payload = {
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_RULES}\n\nคำถามผู้ใช้: ${user}` }]}]
    }

    const url = `${API_ROOT}/models/${ACTIVE_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: j })

    const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ||
                 'ขออภัย ไม่พบคำตอบที่ชัดเจน'
    res.json({ answer: text })
  } catch (e) {
    console.error('Gemini error:', e)
    res.status(500).json({ error: { status: 500, message: 'Server error' } })
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`✅ Server running on http://localhost:${port}`))
