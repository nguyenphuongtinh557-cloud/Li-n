/**
 * Kiểm tra 3 Gemini keys với model đang dùng trong production
 * Run: node check_gemini_keys.cjs
 */

const GEMINI_KEYS = [
  { label: 'Key 1 (AIPool)', key: 'AIzaSyA_YW64oHktvXQALBKurI67x1tdu3LNQ6M' },
  { label: 'Key 2 (AIPool)', key: 'AIzaSyACGSiU_pf21ssY_gqymwGd-_jLqK6qtN8' },
  { label: 'Key 3 (AQ.)', key: 'AQ.' + 'Ab8RN6IrLLZUG9YcOoveslvcA15NLePcQi78ZfLzd3zbs2lBHw' },
  { label: 'Key 4 (document-summary)', key: 'AIzaSyB4rSYnaBvBl4QWPyefSc_rODRZQ6eTrk8' }
];

const MODELS = [
  'gemini-3.5-flash-lite',     // model đang dùng trong production
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash'
];

async function testKey({ label, key }) {
  console.log(`\n🔑 ${label}`);
  console.log(`   Key: ${key.substring(0, 20)}...`);

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Trả lời 1 từ: xin chào' }] }],
          generationConfig: { maxOutputTokens: 5 }
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '(no text)';
        console.log(`   ✅ ${model}: HOẠT ĐỘNG — "${text.trim()}"`);
        return { label, key: key.substring(0, 20), model, status: 'OK' };
      }

      const body = await res.json().catch(() => ({}));
      const errMsg = body?.error?.message || '';

      if (res.status === 403) {
        console.log(`   ❌ ${model}: 403 FORBIDDEN — ${errMsg}`);
      } else if (res.status === 401) {
        console.log(`   ❌ ${model}: 401 UNAUTHORIZED — ${errMsg}`);
        break; // key invalid hoàn toàn
      } else if (res.status === 429) {
        console.log(`   ⚠️  ${model}: 429 QUOTA EXCEEDED — ${errMsg}`);
      } else if (res.status === 404) {
        console.log(`   🔍 ${model}: 404 MODEL NOT FOUND`);
      } else {
        console.log(`   ⚠️  ${model}: ${res.status} — ${errMsg}`);
      }
    } catch (err) {
      console.log(`   ❌ ${model}: NETWORK ERROR — ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return { label, key: key.substring(0, 20), model: null, status: 'FAILED' };
}

async function main() {
  console.log('═'.repeat(60));
  console.log('🔍 KIỂM TRA GEMINI KEYS — PRODUCTION MODELS');
  console.log('═'.repeat(60));

  const results = [];
  for (const entry of GEMINI_KEYS) {
    const r = await testKey(entry);
    results.push(r);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 KẾT QUẢ TỔNG HỢP');
  console.log('═'.repeat(60));

  const working = results.filter(r => r.status === 'OK');
  const failed  = results.filter(r => r.status !== 'OK');

  if (working.length) {
    console.log(`\n✅ Keys hoạt động (${working.length}):`);
    working.forEach(r => console.log(`   • ${r.label} → model: ${r.model}`));
  }
  if (failed.length) {
    console.log(`\n❌ Keys không hoạt động (${failed.length}):`);
    failed.forEach(r => console.log(`   • ${r.label} (${r.key}...)`));
  }
  console.log('\n' + '═'.repeat(60));
}

main().catch(console.error);
