const fs = require('fs');
let code = fs.readFileSync('modules/docSummarizerEngine.js', 'utf8');
code = code.replace(/`chapters\[\]\.content`/g, "'chapters[].content'");
fs.writeFileSync('modules/docSummarizerEngine.js', code);
console.log('Fixed syntax error in docSummarizerEngine.js');
