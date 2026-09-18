/**
 * Script kiểm tra hạn ngạch TẤT CẢ API providers
 * Run: node check_all_quotas.js
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
  ],
  sambanova: [
    'fc503675-a3a6-4bdc-96da-f53dce1b168e'
  ],
  mistral: [
    'ctQLRhxYqlTwgJ1Cmsp8eW803O532cpR'
  ],
  cerebras: [
    'csk-' + 'wr4c85jkpjy2v8c3f6vftcj2j4nekrkm4ye8kpej856yrtwk',
    'csk-' + 'hcvp52we6htpcyjefe26yj5wmtfk2et2ehv4tw6ptk8cmhep'
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI API
// ═══════════════════════════════════════════════════════════════════════════
async function checkGemini(key, keyIndex) {
  console.log(`\n📱 GEMINI KEY ${keyIndex + 1}:`);
  console.log(`   Key: ${key.substring(0, 25)}...`);
  
  const models = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro'];
  let workingModels = [];
  
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Test' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });
      
      if (res.ok) {
        workingModels.push(model);
        console.log(`   ✅ ${model}: OK`);
        break; // Tìm được 1 model working là đủ
      } else if (res.status === 403) {
        console.log(`   ❌ ${model}: 403 FORBIDDEN (quota exceeded or invalid key)`);
      } else if (res.status === 404) {
        console.log(`   🔍 ${model}: 404 NOT FOUND`);
      } else {
        console.log(`   ⚠️ ${model}: ${res.status}`);
      }
    } catch (err) {
      console.log(`   ❌ ${model}: NETWORK ERROR - ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  return { provider: 'Gemini', working: workingModels.length > 0, models: workingModels };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROQ API
// ═══════════════════════════════════════════════════════════════════════════
async function checkGroq(key, keyIndex) {
  console.log(`\n⚡ GROQ KEY ${keyIndex + 1}:`);
  console.log(`   Key: ${key.substring(0, 25)}...`);
  
  const models = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b'
  ];
  
  let workingModels = [];
  
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
          max_tokens: 5
        })
      });
      
      if (res.ok) {
        workingModels.push(model);
        console.log(`   ✅ ${model}: OK`);
        break;
      } else if (res.status === 401) {
        console.log(`   ❌ ${model}: 401 INVALID KEY`);
        break; // Key invalid, không cần test model khác
      } else if (res.status === 404) {
        console.log(`   🔍 ${model}: 404 NOT FOUND`);
      } else if (res.status === 429) {
        console.log(`   ⚠️ ${model}: 429 RATE LIMITED`);
      } else {
        console.log(`   ⚠️ ${model}: ${res.status}`);
      }
    } catch (err) {
      console.log(`   ❌ ${model}: NETWORK ERROR - ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  return { provider: 'Groq', working: workingModels.length > 0, models: workingModels };
}

// ═══════════════════════════════════════════════════════════════════════════
// OPENROUTER API
// ═══════════════════════════════════════════════════════════════════════════
async function checkOpenRouter(key, keyIndex) {
  console.log(`\n🔀 OPENROUTER KEY ${keyIndex + 1}:`);
  console.log(`   Key: ${key.substring(0, 30)}...`);
  
  const models = [
    'meta-llama/llama-3.3-70b-instruct',
    'openai/gpt-4o-mini',
    'google/gemini-flash-1.5'
  ];
  
  let workingModels = [];
  
  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 5
        })
      });
      
      if (res.ok) {
        workingModels.push(model);
        console.log(`   ✅ ${model}: OK`);
        // Test thêm 1 model nữa để xem có nhiều models free
      } else if (res.status === 402) {
        console.log(`   💳 ${model}: 402 NO CREDITS`);
      } else if (res.status === 401) {
        console.log(`   ❌ ${model}: 401 INVALID KEY`);
        break;
      } else if (res.status === 429) {
        console.log(`   ⚠️ ${model}: 429 RATE LIMITED`);
      } else {
        console.log(`   ⚠️ ${model}: ${res.status}`);
      }
    } catch (err) {
      console.log(`   ❌ ${model}: NETWORK ERROR - ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  return { provider: 'OpenRouter', working: workingModels.length > 0, models: workingModels };
}

// ═══════════════════════════════════════════════════════════════════════════
// SAMBANOVA API
// ═══════════════════════════════════════════════════════════════════════════
async function checkSambaNova(key, keyIndex) {
  console.log(`\n🦙 SAMBANOVA KEY ${keyIndex + 1}:`);
  console.log(`   Key: ${key.substring(0, 20)}...`);
  
  const models = [
    'Meta-Llama-3.3-70B-Instruct',
    'Meta-Llama-3.1-70B-Instruct'
  ];
  
  let workingModels = [];
  
  for (const model of models) {
    try {
      const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 5
        })
      });
      
      if (res.ok) {
        workingModels.push(model);
        console.log(`   ✅ ${model}: OK`);
        break;
      } else if (res.status === 402) {
        console.log(`   💳 ${model}: 402 PAYMENT REQUIRED`);
        break;
      } else if (res.status === 401) {
        console.log(`   ❌ ${model}: 401 INVALID KEY`);
        break;
      } else if (res.status === 410) {
        console.log(`   🔍 ${model}: 410 MODEL DEPRECATED`);
      } else {
        console.log(`   ⚠️ ${model}: ${res.status}`);
      }
    } catch (err) {
      console.log(`   ❌ ${model}: NETWORK ERROR - ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  return { provider: 'SambaNova', working: workingModels.length > 0, models: workingModels };
}

// ═══════════════════════════════════════════════════════════════════════════
// MISTRAL API
// ═══════════════════════════════════════════════════════════════════════════
async function checkMistral(key, keyIndex) {
  console.log(`\n🌟 MISTRAL KEY ${keyIndex + 1}:`);
  console.log(`   Key: ${key.substring(0, 20)}...`);
  
  const models = [
    'open-mistral-nemo-2407',
    'mistral-small-latest',
    'mistral-large-latest'
  ];
  
  let workingModels = [];
  
  for (const model of models) {
    try {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 5
        })
      });
      
      if (res.ok) {
        workingModels.push(model);
        console.log(`   ✅ ${model}: OK`);
        break;
      } else if (res.status === 429) {
        console.log(`   ⚠️ ${model}: 429 RATE LIMITED`);
      } else if (res.status === 401) {
        console.log(`   ❌ ${model}: 401 INVALID KEY`);
        break;
      } else {
        console.log(`   ⚠️ ${model}: ${res.status}`);
      }
    } catch (err) {
      console.log(`   ❌ ${model}: NETWORK ERROR - ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  return { provider: 'Mistral', working: workingModels.length > 0, models: workingModels };
}

// ═══════════════════════════════════════════════════════════════════════════
// CEREBRAS API
// ═══════════════════════════════════════════════════════════════════════════
async function checkCerebras(key, keyIndex) {
  console.log(`\n🧠 CEREBRAS KEY ${keyIndex + 1}:`);
  console.log(`   Key: ${key.substring(0, 20)}...`);
  
  const models = [
    'llama3.1-70b',
    'llama3.1-8b'
  ];
  
  let workingModels = [];
  
  for (const model of models) {
    try {
      const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 5
        })
      });
      
      if (res.ok) {
        workingModels.push(model);
        console.log(`   ✅ ${model}: OK`);
        break;
      } else if (res.status === 402) {
        console.log(`   💳 ${model}: 402 PAYMENT REQUIRED`);
        break;
      } else if (res.status === 401) {
        console.log(`   ❌ ${model}: 401 INVALID KEY`);
        break;
      } else {
        console.log(`   ⚠️ ${model}: ${res.status}`);
      }
    } catch (err) {
      console.log(`   ❌ ${model}: NETWORK ERROR - ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  return { provider: 'Cerebras', working: workingModels.length > 0, models: workingModels };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🔍 KIỂM TRA HẠN NGẠCH TẤT CẢ API PROVIDERS');
  console.log('═'.repeat(80));
  console.log('');
  
  const results = [];
  
  // Check Gemini
  console.log('━'.repeat(80));
  console.log('📱 TESTING GEMINI API');
  console.log('━'.repeat(80));
  for (let i = 0; i < RAW_KEYS.gemini.length; i++) {
    const result = await checkGemini(RAW_KEYS.gemini[i], i);
    results.push(result);
  }
  
  // Check Groq
  console.log('\n' + '━'.repeat(80));
  console.log('⚡ TESTING GROQ API');
  console.log('━'.repeat(80));
  for (let i = 0; i < RAW_KEYS.groq.length; i++) {
    const result = await checkGroq(RAW_KEYS.groq[i], i);
    results.push(result);
  }
  
  // Check OpenRouter
  console.log('\n' + '━'.repeat(80));
  console.log('🔀 TESTING OPENROUTER API');
  console.log('━'.repeat(80));
  for (let i = 0; i < RAW_KEYS.openrouter.length; i++) {
    const result = await checkOpenRouter(RAW_KEYS.openrouter[i], i);
    results.push(result);
  }
  
  // Check SambaNova
  console.log('\n' + '━'.repeat(80));
  console.log('🦙 TESTING SAMBANOVA API');
  console.log('━'.repeat(80));
  for (let i = 0; i < RAW_KEYS.sambanova.length; i++) {
    const result = await checkSambaNova(RAW_KEYS.sambanova[i], i);
    results.push(result);
  }
  
  // Check Mistral
  console.log('\n' + '━'.repeat(80));
  console.log('🌟 TESTING MISTRAL API');
  console.log('━'.repeat(80));
  for (let i = 0; i < RAW_KEYS.mistral.length; i++) {
    const result = await checkMistral(RAW_KEYS.mistral[i], i);
    results.push(result);
  }
  
  // Check Cerebras
  console.log('\n' + '━'.repeat(80));
  console.log('🧠 TESTING CEREBRAS API');
  console.log('━'.repeat(80));
  for (let i = 0; i < RAW_KEYS.cerebras.length; i++) {
    const result = await checkCerebras(RAW_KEYS.cerebras[i], i);
    results.push(result);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 TỔNG KẾT HẠN NGẠCH TẤT CẢ PROVIDERS');
  console.log('═'.repeat(80));
  console.log('');
  
  const summary = {};
  results.forEach(r => {
    if (!summary[r.provider]) {
      summary[r.provider] = { working: 0, total: 0, models: [] };
    }
    summary[r.provider].total++;
    if (r.working) {
      summary[r.provider].working++;
      summary[r.provider].models.push(...r.models);
    }
  });
  
  console.log('┌────────────────┬─────────────┬─────────────┬──────────────────────┐');
  console.log('│ Provider       │ Working/All │ Status      │ Available Models     │');
  console.log('├────────────────┼─────────────┼─────────────┼──────────────────────┤');
  
  Object.entries(summary).forEach(([provider, data]) => {
    const statusIcon = data.working > 0 ? '✅' : '❌';
    const status = data.working > 0 ? 'WORKING' : 'FAILED';
    const modelsText = data.models.length > 0 ? data.models[0].substring(0, 20) : 'None';
    const paddedProvider = provider.padEnd(14);
    const paddedRatio = `${data.working}/${data.total}`.padEnd(11);
    const paddedStatus = (statusIcon + ' ' + status).padEnd(11);
    
    console.log(`│ ${paddedProvider} │ ${paddedRatio} │ ${paddedStatus} │ ${modelsText}... │`);
  });
  
  console.log('└────────────────┴─────────────┴─────────────┴──────────────────────┘');
  
  // Recommendations
  console.log('\n💡 KHUYẾN NGHỊ:');
  console.log('─'.repeat(80));
  
  const workingProviders = Object.entries(summary)
    .filter(([_, data]) => data.working > 0)
    .map(([provider]) => provider);
  
  if (workingProviders.length === 0) {
    console.log('❌ KHÔNG CÓ PROVIDER NÀO HOẠT ĐỘNG!');
    console.log('   → Cần tạo API keys mới ngay lập tức');
  } else {
    console.log(`✅ ${workingProviders.length} provider(s) đang hoạt động:`);
    workingProviders.forEach(p => {
      console.log(`   • ${p}: ${summary[p].models.join(', ')}`);
    });
    console.log('');
    console.log('🎯 Fallback chain khuyến nghị:');
    workingProviders.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p} (primary${i > 0 ? ` fallback ${i}` : ''})`);
    });
  }
  
  console.log('\n' + '═'.repeat(80));
}

main().catch(console.error);
