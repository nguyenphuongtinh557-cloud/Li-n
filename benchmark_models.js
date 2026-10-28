/**
 * BENCHMARK: So sánh 4 models AI
 * - Cloudflare Llama 3.1 8B
 * - Gemini 3.5 Flash Lite
 * - Groq GPT OSS 120B
 * - OpenRouter Llama 3.3 70B
 */

const CLOUDFLARE_TOKEN = process.env.CLOUDFLARE_TOKEN || 'YOUR_CLOUDFLARE_TOKEN';
const CLOUDFLARE_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '';

const GEMINI_KEY = process.env.GEMINI_KEY || 'YOUR_GEMINI_KEY';
const GROQ_KEY = process.env.GROQ_KEY || 'YOUR_GROQ_KEY';
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || 'YOUR_OPENROUTER_KEY';

// Test prompt về QLCL
const TEST_PROMPT = `Giải thích ngắn gọn về hệ thống HACCP trong quản lý chất lượng thực phẩm. Bao gồm 7 nguyên tắc cơ bản và tại sao nó quan trọng trong ngành công nghiệp thực phẩm.`;

// ═══════════════════════════════════════════════════════════════════════
// TEST CLOUDFLARE WORKERS AI
// ═══════════════════════════════════════════════════════════════════════
async function testCloudflare() {
  console.log('\n🔷 CLOUDFLARE WORKERS AI - Llama 3.1 8B (fp8-fast)');
  console.log('━'.repeat(70));
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT}/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8-fast`;
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: TEST_PROMPT }],
        max_tokens: 500
      })
    });
    
    const data = await response.json();
    const duration = (Date.now() - startTime) / 1000;
    
    if (data.success && data.result?.response) {
      const output = data.result.response;
      return analyzeResponse('Cloudflare Llama 3.1 8B', output, duration, 'FREE (10K neurons/day)');
    } else {
      console.log('❌ Error:', data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TEST GEMINI 3.5 FLASH LITE
// ═══════════════════════════════════════════════════════════════════════
async function testGemini() {
  console.log('\n🔶 GOOGLE GEMINI 3.5 FLASH LITE');
  console.log('━'.repeat(70));
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_KEY}`;
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: TEST_PROMPT }] }],
        generationConfig: { 
          temperature: 0.2,
          maxOutputTokens: 500
        }
      })
    });
    
    const data = await response.json();
    const duration = (Date.now() - startTime) / 1000;
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      const output = data.candidates[0].content.parts[0].text;
      return analyzeResponse('Gemini 3.5 Flash Lite', output, duration, 'FREE (500 RPD)');
    } else {
      console.log('❌ Error:', data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TEST GROQ GPT OSS 120B
// ═══════════════════════════════════════════════════════════════════════
async function testGroq() {
  console.log('\n🔵 GROQ - GPT OSS 120B');
  console.log('━'.repeat(70));
  
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: TEST_PROMPT }],
        temperature: 0.2,
        max_tokens: 500
      })
    });
    
    const data = await response.json();
    const duration = (Date.now() - startTime) / 1000;
    
    if (data.choices?.[0]?.message?.content) {
      const output = data.choices[0].message.content;
      return analyzeResponse('Groq GPT OSS 120B', output, duration, 'FREE (6000 RPD)');
    } else {
      console.log('❌ Error:', data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TEST OPENROUTER LLAMA 3.3 70B
// ═══════════════════════════════════════════════════════════════════════
async function testOpenRouter() {
  console.log('\n🟣 OPENROUTER - Meta Llama 3.3 70B');
  console.log('━'.repeat(70));
  
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fteca24.netlify.app'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: TEST_PROMPT }],
        temperature: 0.2,
        max_tokens: 500
      })
    });
    
    const data = await response.json();
    const duration = (Date.now() - startTime) / 1000;
    
    if (data.choices?.[0]?.message?.content) {
      const output = data.choices[0].message.content;
      return analyzeResponse('OpenRouter Llama 3.3 70B', output, duration, 'PAID ($0.06/1M tokens)');
    } else {
      console.log('❌ Error:', data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ANALYZE RESPONSE
// ═══════════════════════════════════════════════════════════════════════
function analyzeResponse(modelName, output, duration, pricing) {
  const chars = output.length;
  const words = output.split(/\s+/).length;
  const tokensApprox = Math.round(chars / 4);
  const tokensPerSec = Math.round((tokensApprox / duration) * 10) / 10;
  
  // Check quality markers
  const hasHACCP = /HACCP/i.test(output);
  const has7Principles = /7.*nguyên tắc|bảy.*nguyên tắc/i.test(output) || 
                         (output.match(/\d\./g) || []).length >= 6;
  const hasVietnamese = /thực phẩm|chất lượng|công nghiệp/i.test(output);
  const mentionsImportance = /quan trọng|cần thiết|đảm bảo/i.test(output);
  
  const qualityScore = 
    (hasHACCP ? 1 : 0) + 
    (has7Principles ? 1 : 0) + 
    (hasVietnamese ? 1 : 0) + 
    (mentionsImportance ? 1 : 0);
  
  console.log(`\n✅ SUCCESS`);
  console.log(`⏱️  Thời gian: ${duration.toFixed(2)}s`);
  console.log(`📊 Output: ${chars} ký tự | ${words} từ | ~${tokensApprox} tokens`);
  console.log(`🚀 Tốc độ: ~${tokensPerSec} tokens/giây`);
  console.log(`💰 Pricing: ${pricing}`);
  console.log(`⭐ Chất lượng: ${qualityScore}/4 (HACCP: ${hasHACCP ? '✓' : '✗'}, 7 nguyên tắc: ${has7Principles ? '✓' : '✗'})`);
  console.log(`\n📝 Response (first 200 chars):`);
  console.log('─'.repeat(70));
  console.log(output.substring(0, 200) + '...');
  
  return {
    model: modelName,
    duration,
    chars,
    words,
    tokensApprox,
    tokensPerSec,
    pricing,
    qualityScore,
    output,
    hasHACCP,
    has7Principles
  };
}

// ═══════════════════════════════════════════════════════════════════════
// RUN BENCHMARK
// ═══════════════════════════════════════════════════════════════════════
async function runBenchmark() {
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('  🏆 AI MODELS BENCHMARK - FTECA 24 COMPARISON');
  console.log('═'.repeat(70));
  console.log(`📝 Test Prompt: "${TEST_PROMPT.substring(0, 80)}..."`);
  console.log('');
  
  const results = [];
  
  // Test all models
  const cloudflare = await testCloudflare();
  if (cloudflare) results.push(cloudflare);
  
  await new Promise(r => setTimeout(r, 1000));
  
  const gemini = await testGemini();
  if (gemini) results.push(gemini);
  
  await new Promise(r => setTimeout(r, 1000));
  
  const groq = await testGroq();
  if (groq) results.push(groq);
  
  await new Promise(r => setTimeout(r, 1000));
  
  const openrouter = await testOpenRouter();
  if (openrouter) results.push(openrouter);
  
  // Summary table
  console.log('\n\n');
  console.log('═'.repeat(70));
  console.log('  📊 BẢNG TỔNG KẾT');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Model                      | Speed    | Quality | Pricing');
  console.log('─'.repeat(70));
  
  results.forEach(r => {
    const model = r.model.padEnd(25);
    const speed = `${r.tokensPerSec} tok/s`.padEnd(8);
    const quality = `${r.qualityScore}/4`.padEnd(7);
    console.log(`${model} | ${speed} | ${quality} | ${r.pricing}`);
  });
  
  console.log('═'.repeat(70));
  
  // Winners
  const fastest = results.sort((a, b) => b.tokensPerSec - a.tokensPerSec)[0];
  const bestQuality = results.sort((a, b) => b.qualityScore - a.qualityScore)[0];
  const bestFree = results.filter(r => r.pricing.includes('FREE')).sort((a, b) => b.qualityScore - a.qualityScore)[0];
  
  console.log('\n🏆 KẾT QUẢ:');
  console.log(`   🚀 Nhanh nhất: ${fastest.model} (${fastest.tokensPerSec} tok/s)`);
  console.log(`   ⭐ Chất lượng cao nhất: ${bestQuality.model} (${bestQuality.qualityScore}/4)`);
  if (bestFree) {
    console.log(`   💰 Tốt nhất (FREE): ${bestFree.model} (${bestFree.qualityScore}/4, ${bestFree.tokensPerSec} tok/s)`);
  }
  
  console.log('\n💡 KHUYẾN NGHỊ:');
  if (bestFree && bestFree.qualityScore >= 3 && bestFree.tokensPerSec > 80) {
    console.log(`   ✅ Dùng ${bestFree.model} cho production (free, nhanh, chất lượng tốt)`);
  }
  if (fastest.tokensPerSec > 120) {
    console.log(`   ⚡ ${fastest.model} phù hợp cho real-time chatbot`);
  }
  if (bestQuality.qualityScore === 4) {
    console.log(`   🎯 ${bestQuality.model} cho nội dung quan trọng (tóm tắt, generate câu hỏi)`);
  }
  
  console.log('\n');
}

// Run
runBenchmark().catch(console.error);
