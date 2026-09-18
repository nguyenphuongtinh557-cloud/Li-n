import https from 'https';

const GEMINI_KEY = 'AIzaAQ.Ab8RN6IrLLZUG9YcOoveslvcA15NLePcQi78ZfLzd3zbs2lBHw';
const MODEL = 'gemini-flash-latest';

console.log('🔍 Kiểm tra Gemini API Key...\n');

// Test request với Gemini API
const testData = JSON.stringify({
  contents: [{
    parts: [{
      text: 'Hello, this is a test. Reply with just "OK".'
    }]
  }]
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path: `/v1beta/models/${MODEL}:generateContent`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-goog-api-key': GEMINI_KEY,
    'Content-Length': testData.length
  }
};

const req = https.request(options, (res) => {
  let data = '';

  console.log(`📊 Status Code: ${res.statusCode}`);
  console.log(`📋 Headers:`, JSON.stringify(res.headers, null, 2));
  console.log('');

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (res.statusCode === 200) {
        console.log('✅ KEY HỢP LỆ - Gemini API hoạt động!\n');
        console.log('📝 Response:', JSON.stringify(response, null, 2));
        
        if (response.candidates && response.candidates[0]) {
          const text = response.candidates[0].content.parts[0].text;
          console.log('\n💬 Gemini trả lời:', text);
        }
        
        // Kiểm tra usage metadata
        if (response.usageMetadata) {
          console.log('\n📊 Usage:');
          console.log(`   - Prompt tokens: ${response.usageMetadata.promptTokenCount}`);
          console.log(`   - Response tokens: ${response.usageMetadata.candidatesTokenCount}`);
          console.log(`   - Total tokens: ${response.usageMetadata.totalTokenCount}`);
        }
      } else {
        console.log('❌ KEY KHÔNG HỢP LỆ hoặc có lỗi:\n');
        console.log(JSON.stringify(response, null, 2));
        
        if (response.error) {
          console.log('\n🔴 Error Details:');
          console.log(`   - Code: ${response.error.code}`);
          console.log(`   - Message: ${response.error.message}`);
          console.log(`   - Status: ${response.error.status}`);
        }
      }
    } catch (e) {
      console.log('❌ Lỗi parse response:');
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request error:', e.message);
});

req.write(testData);
req.end();
