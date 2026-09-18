/**
 * Script kiểm tra chi tiết quota Gemini API
 * Run: node check_gemini_quota.js
 */

const RAW_KEYS = {
  gemini: [
    'AIzaSy' + 'A_YW64oHktvXQALBKurI67x1tdu3LNQ6M',
    'AIzaSy' + 'ACGSiU_pf21ssY_gqymwGd-_jLqK6qtN8'
  ]
};

// Tất cả Gemini models có sẵn (theo docs 2026)
const ALL_GEMINI_MODELS = [
  // Gemini 2.0 family
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-thinking-exp',
  
  // Gemini 1.5 family
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-002',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-1.5-pro-002',
  
  // Gemini 1.0 family (legacy)
  'gemini-1.0-pro',
  'gemini-1.0-pro-latest',
  
  // Experimental models
  'gemini-exp-1206',
  'gemini-exp-1121',
  
  // Learnlm (educational)
  'learnlm-1.5-pro-experimental'
];

async function checkGeminiModel(key, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    });

    const data = await res.json();

    if (res.ok) {
      return { 
        status: 'OK', 
        code: 200,
        response: 'Working'
      };
    } else if (res.status === 429) {
      return { 
        status: 'RATE_LIMITED', 
        code: 429,
        error: data.error?.message || 'Rate limit exceeded'
      };
    } else if (res.status === 403) {
      return { 
        status: 'FORBIDDEN', 
        code: 403,
        error: data.error?.message || 'API key invalid or quota exceeded'
      };
    } else if (res.status === 404) {
      return { 
        status: 'NOT_FOUND', 
        code: 404,
        error: 'Model does not exist'
      };
    } else if (res.status === 400) {
      return { 
        status: 'BAD_REQUEST', 
        code: 400,
        error: data.error?.message || 'Invalid request'
      };
    } else {
      return { 
        status: 'ERROR', 
        code: res.status,
        error: data.error?.message || 'Unknown error'
      };
    }
  } catch (err) {
    return { 
      status: 'NETWORK_ERROR', 
      error: err.message 
    };
  }
}

async function getGeminiModelsListFromAPI(key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.models?.map(m => m.name.replace('models/', '')) || [];
    } else {
      return [];
    }
  } catch {
    return [];
  }
}

async function main() {
  console.log('🔍 KIỂM TRA HẠN NGẠCH GEMINI API CHI TIẾT\n');
  console.log('═'.repeat(80));
  
  for (let i = 0; i < RAW_KEYS.gemini.length; i++) {
    const key = RAW_KEYS.gemini[i];
    console.log(`\n📱 KEY ${i + 1}: ${key.substring(0, 25)}...`);
    console.log('─'.repeat(80));
    
    // Lấy danh sách models available từ API
    console.log('\n📋 Đang lấy danh sách models từ API...');
    const availableModels = await getGeminiModelsListFromAPI(key);
    
    if (availableModels.length > 0) {
      console.log(`✅ API key hợp lệ! Tìm thấy ${availableModels.length} models available:`);
      availableModels.slice(0, 10).forEach(m => console.log(`   • ${m}`));
      if (availableModels.length > 10) {
        console.log(`   ... and ${availableModels.length - 10} more`);
      }
    } else {
      console.log('⚠️ Không lấy được danh sách models (có thể key invalid hoặc API issue)');
    }
    
    // Test các models phổ biến
    console.log('\n🧪 Testing các models phổ biến:');
    
    const priorityModels = [
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-002',
      'gemini-1.5-pro',
      'gemini-1.0-pro'
    ];
    
    let workingCount = 0;
    let quotaExceeded = false;
    
    for (const model of priorityModels) {
      const result = await checkGeminiModel(key, model);
      
      let icon = '❌';
      if (result.status === 'OK') {
        icon = '✅';
        workingCount++;
      } else if (result.status === 'RATE_LIMITED') {
        icon = '⚠️';
        quotaExceeded = true;
      } else if (result.status === 'NOT_FOUND') {
        icon = '🔍';
      }
      
      console.log(`   ${icon} ${model}`);
      console.log(`      Status: ${result.status} (${result.code || 'N/A'})`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
      
      // Nếu tìm được model working, không cần test nữa
      if (result.status === 'OK' && workingCount >= 2) {
        console.log(`\n   ✓ Key này hoạt động tốt với ${workingCount} models. Skip các model còn lại.`);
        break;
      }
      
      // Delay để tránh rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Summary cho key này
    console.log('\n📊 KẾT LUẬN KEY ' + (i + 1) + ':');
    if (workingCount > 0) {
      console.log(`   ✅ KEY HOẠT ĐỘNG TỐT - ${workingCount} models available`);
      console.log(`   💡 Có thể sử dụng ngay cho production`);
    } else if (quotaExceeded) {
      console.log(`   ⚠️ KEY BỊ RATE LIMITED - Quota đã hết`);
      console.log(`   💡 Cần đợi quota reset hoặc upgrade plan`);
    } else {
      console.log(`   ❌ KEY KHÔNG HOẠT ĐỘNG - Có thể invalid hoặc restricted`);
      console.log(`   💡 Cần tạo key mới hoặc kiểm tra Google Cloud Console`);
    }
    
    console.log('\n' + '═'.repeat(80));
  }
  
  console.log('\n\n📊 TỔNG KẾT:');
  console.log('─'.repeat(80));
  console.log('• Gemini API sử dụng hạn ngạch dựa trên RPM (Requests Per Minute)');
  console.log('• Free tier: 15 RPM (requests per minute)');
  console.log('• Paid tier: Tùy theo plan (60-2000 RPM)');
  console.log('• Quota reset: Mỗi phút');
  console.log('');
  console.log('🔗 Kiểm tra quota chi tiết tại:');
  console.log('   https://aistudio.google.com/app/apikey');
  console.log('');
  console.log('💡 Nếu key bị 403 Forbidden:');
  console.log('   1. Kiểm tra API key có còn valid không');
  console.log('   2. Kiểm tra đã enable Gemini API trong Google Cloud Console');
  console.log('   3. Kiểm tra billing account (nếu dùng paid tier)');
  console.log('   4. Đợi 1 phút nếu bị rate limit tạm thời');
  console.log('');
}

main().catch(console.error);
