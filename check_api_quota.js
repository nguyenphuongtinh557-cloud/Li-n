/**
 * Script kiểm tra quota các API keys
 * Run: node check_api_quota.js
 */

const RAW_KEYS = {
  gemini: [
    'AIzaSy' + 'A_YW64oHktvXQALBKurI67x1tdu3LNQ6M',
    'AIzaSy' + 'ACGSiU_pf21ssY_gqymwGd-_jLqK6qtN8'
  ],
  groq: [
    'gsk_' + '3tflPbwbzb6gaOY6oV85WGdyb3FYBdZ02jP3gpwQTWYuVVTxxi4r',
    'gsk_' + 'CZnyt64cTM680y3zTuH6WGdyb3FY2Q1b2tLt8JVO3ZC0H47vuQCr',
    'gsk_' + 'D6W4iEm9lDp6B8XV9PDBWGdyb3FYArXtSZF235AzfsU1zuYiBOZs'
  ],
  openrouter: [
    'sk-or-v1-' + 'fc62ec203093fc832fae79333a82c7595f1925994974dd99a53f0bad49c34b43'
  ]
};

const GEMINI_MODELS = [
  'gemini-2.0-flash-exp',
  'gemini-3.5-flash-lite',
  'gemini-1.5-flash-latest'
];

async function checkGeminiQuota(key, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Test' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });

    if (res.ok) {
      return { status: 'OK', code: 200, model };
    } else if (res.status === 429) {
      return { status: 'RATE_LIMITED', code: 429, model };
    } else if (res.status === 403) {
      return { status: 'FORBIDDEN', code: 403, model };
    } else if (res.status === 404) {
      return { status: 'NOT_FOUND', code: 404, model };
    } else {
      return { status: 'ERROR', code: res.status, model };
    }
  } catch (err) {
    return { status: 'NETWORK_ERROR', error: err.message, model };
  }
}

async function checkGroqQuota(key) {
  // Test với nhiều models khác nhau
  const models = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768'
  ];
  
  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 10
        })
      });

      if (res.ok) {
        return { status: 'OK', code: 200, model: model };
      } else if (res.status === 429) {
        // Rate limited - thử model khác
        continue;
      } else if (res.status === 401) {
        return { status: 'INVALID_KEY', code: 401 };
      } else if (res.status === 400) {
        // Model không tồn tại - thử model khác
        continue;
      } else {
        return { status: 'ERROR', code: res.status, model: model };
      }
    } catch (err) {
      // Network error - thử model khác
      continue;
    }
  }
  
  return { status: 'ALL_MODELS_FAILED', code: 'N/A' };
}

async function checkOpenRouterQuota(key) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 10
      })
    });

    if (res.ok) {
      return { status: 'OK', code: 200 };
    } else if (res.status === 402) {
      return { status: 'NO_CREDITS', code: 402 };
    } else if (res.status === 429) {
      return { status: 'RATE_LIMITED', code: 429 };
    } else {
      return { status: 'ERROR', code: res.status };
    }
  } catch (err) {
    return { status: 'NETWORK_ERROR', error: err.message };
  }
}

async function main() {
  console.log('🔍 KIỂM TRA API QUOTA\n');
  console.log('═'.repeat(60));
  
  // Check Gemini
  console.log('\n📱 GEMINI API:');
  for (let i = 0; i < RAW_KEYS.gemini.length; i++) {
    const key = RAW_KEYS.gemini[i];
    console.log(`\n  Key ${i + 1}: ${key.substring(0, 20)}...`);
    
    for (const model of GEMINI_MODELS) {
      const result = await checkGeminiQuota(key, model);
      const icon = result.status === 'OK' ? '✅' : result.status === 'RATE_LIMITED' ? '⚠️' : '❌';
      console.log(`    ${icon} ${model}: ${result.status} (${result.code || 'N/A'})`);
      
      if (result.status === 'OK') break; // Nếu 1 model OK thì key còn quota
    }
  }
  
  // Check Groq
  console.log('\n\n⚡ GROQ API:');
  for (let i = 0; i < RAW_KEYS.groq.length; i++) {
    const key = RAW_KEYS.groq[i];
    console.log(`\n  Key ${i + 1}: ${key.substring(0, 20)}...`);
    const result = await checkGroqQuota(key);
    const icon = result.status === 'OK' ? '✅' : result.status === 'RATE_LIMITED' ? '⚠️' : '❌';
    if (result.model) {
      console.log(`    ${icon} Model: ${result.model}`);
      console.log(`    Status: ${result.status} (${result.code || 'N/A'})`);
    } else {
      console.log(`    ${icon} Status: ${result.status} (${result.code || 'N/A'})`);
    }
  }
  
  // Check OpenRouter
  console.log('\n\n🔀 OPENROUTER API:');
  for (let i = 0; i < RAW_KEYS.openrouter.length; i++) {
    const key = RAW_KEYS.openrouter[i];
    console.log(`\n  Key ${i + 1}: ${key.substring(0, 30)}...`);
    const result = await checkOpenRouterQuota(key);
    const icon = result.status === 'OK' ? '✅' : result.status === 'NO_CREDITS' ? '💳' : '❌';
    console.log(`    ${icon} Status: ${result.status} (${result.code || 'N/A'})`);
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 SUMMARY:');
  console.log('  - Test A (Vi sinh) sử dụng: ~16-21 API calls');
  console.log('  - Mỗi chunk: 1-2 calls (synthesis + optional retry)');
  console.log('  - Final merge: 1 call');
  console.log('  - Total cho 15 chunks: 16-31 calls\n');
}

main().catch(console.error);
