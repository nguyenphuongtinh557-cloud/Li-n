/**
 * Benchmark Cloudflare Workers AI Speed
 */

const API_TOKEN = process.env.CLOUDFLARE_TOKEN || 'YOUR_CLOUDFLARE_TOKEN';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';

async function testModel(modelName, modelId) {
  console.log(`\n🔥 Testing: ${modelName}`);
  console.log('━'.repeat(50));
  
  const prompt = "Viết 3 câu về quản lý chất lượng thực phẩm trong công nghiệp.";
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${modelId}`;
  
  const body = {
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 300
  };
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    if (data.success && data.result && data.result.response) {
      const output = data.result.response;
      const chars = output.length;
      const tokensApprox = Math.round(chars / 4);
      const tokensPerSec = Math.round(tokensApprox / duration * 10) / 10;
      
      console.log(`\n✅ SUCCESS!`);
      console.log(`\n⏱️  Thời gian: ${duration.toFixed(2)} giây`);
      console.log(`📊 Output: ${chars} ký tự (~${tokensApprox} tokens)`);
      console.log(`🚀 Tốc độ: ~${tokensPerSec} tokens/giây`);
      console.log(`\n💬 Response:`);
      console.log('─'.repeat(50));
      console.log(output);
      console.log('─'.repeat(50));
      
      return { success: true, duration, tokensPerSec };
    } else {
      console.log(`❌ Failed:`, data);
      return { success: false };
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runBenchmark() {
  console.log('\n⚡⚡⚡ CLOUDFLARE WORKERS AI BENCHMARK ⚡⚡⚡\n');
  
  const models = [
    { name: 'Llama 3.1 8B Instruct', id: '@cf/meta/llama-3.1-8b-instruct' },
    { name: 'Qwen 2.5 7B Instruct', id: '@cf/qwen/qwen2.5-7b-instruct' },
    { name: 'Llama 3.2 1B Instruct', id: '@cf/meta/llama-3.2-1b-instruct' }
  ];
  
  const results = [];
  
  for (const model of models) {
    const result = await testModel(model.name, model.id);
    results.push({ ...model, ...result });
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n\n📊 BẢNG TỔNG KẾT:');
  console.log('═'.repeat(60));
  console.log('Model                         | Thời gian | Tốc độ (tokens/s)');
  console.log('─'.repeat(60));
  
  results.forEach(r => {
    if (r.success) {
      const name = r.name.padEnd(28);
      const time = `${r.duration.toFixed(2)}s`.padEnd(9);
      const speed = `~${r.tokensPerSec}`;
      console.log(`${name} | ${time} | ${speed}`);
    }
  });
  
  console.log('═'.repeat(60));
  
  // Find fastest
  const fastest = results.filter(r => r.success).sort((a, b) => b.tokensPerSec - a.tokensPerSec)[0];
  if (fastest) {
    console.log(`\n🏆 NHANH NHẤT: ${fastest.name}`);
    console.log(`   Tốc độ: ~${fastest.tokensPerSec} tokens/giây`);
  }
}

runBenchmark().catch(console.error);
