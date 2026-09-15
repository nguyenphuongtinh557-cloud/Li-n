const fs = require('fs');
let code = fs.readFileSync('modules/docSummarizerEngine.js', 'utf8');
let patchCount = 0;

// ─── PATCH 1: extractChunkToBank — không được silent return rỗng ───────────────
const extRegex = /\/\/ Fallback\r?\n\s+return \{ facts: \[\], mechanisms: \[\], sections: \[\], domain_expansions: \[\] \};\r?\n\}/;
const ext_replacement = `  // Extraction thất bại sau tất cả retry — trả về trạng thái rõ ràng, không silent empty
  console.error('[KB Extraction] Chunk thất bại sau tất cả retry. Marking EXTRACTION_FAILED.');
  return {
    success: false,
    status: 'EXTRACTION_FAILED',
    chunkId,
    facts: [],
    mechanisms: [],
    sections: [],
    domain_expansions: []
  };
}`;
if (extRegex.test(code)) {
  code = code.replace(extRegex, ext_replacement);
  patchCount++;
  console.log('[1/3] Patched extractChunkToBank silent-empty return');
} else {
  console.warn('[1/3] SKIP: extractChunkToBank fallback not found (may already be patched)');
}

// ─── PATCH 2: runDeepPipeline — kiểm tra extraction failed ─────────────────────
const runRegex = /\/\/ Stage 3: Merge into Knowledge Bank\r?\n\s+bank\.addFromExtraction\(extraction\);\r?\n\s+bank\.totalSourceChars \+= chunks\[i\]\.text\.length;/;
const runtarget_replacement = `    // Stage 3: Merge into Knowledge Bank — skip FAILED extractions
    if (extraction.success === false && extraction.status === 'EXTRACTION_FAILED') {
      console.error('[KB Stage 3] Chunk EXTRACTION_FAILED — bỏ qua chunk này.');
      bank.failedChunks = (bank.failedChunks || 0) + 1;
    } else {
      bank.addFromExtraction(extraction);
      bank.totalSourceChars += chunks[i].text.length;
    }`;
if (runRegex.test(code)) {
  code = code.replace(runRegex, runtarget_replacement);
  patchCount++;
  console.log('[2/3] Patched runDeepPipeline extraction-failed handling');
} else {
  console.warn('[2/3] SKIP: runDeepPipeline merge target not found (may already be patched)');
}

// ─── PATCH 3: deterministicValidate — Outline Detection + Number Coverage ───────
const detRegex = /const criticalCount = issues\.filter\(i =\> i\.severity === 'CRITICAL'\)\.length;/;
if (!detRegex.test(code)) {
  console.error('[3/3] FAIL: deterministicValidate criticalCount line not found!');
} else if (code.includes('outline_detected')) {
  console.warn('[3/3] SKIP: Outline Detection already patched');
  patchCount++;
} else {
  // Build insertion string without any template literals to avoid escaping issues
  const insertBefore = "  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;";
  
  const numberCoverageCode = [
    '',
    '  // Number Coverage Check: Tat ca so lieu trong Bank phai xuat hien trong Final Output',
    '  let numberMissed = 0;',
    '  for (const num of bank.numbers) {',
    "    if (!num.value || !num.unit) continue;",
    "    const valN = String(num.value).replace(/[.,]/g, '[.,]?').replace(/[-\\u2013~]/g, '[-\\u2013~\\\\s]?');",
    "    const unitEscN = String(num.unit).replace(/[.*+?^${}()|\\[\\]\\\\\\u00b5]/g, '\\\\$&');",
    "    const exactReN = new RegExp(valN + '\\\\s*' + unitEscN, 'i');",
    '    if (!exactReN.test(outputStr)) {',
    '      numberMissed++;',
    '      if (numberMissed <= 10) {',
    '        issues.push({',
    "          severity: 'CRITICAL',",
    "          type    : 'number_missing_from_output',",
    '          fact_id : num.fact_id,',
    '          message : `\u274c NUMBER MISSING: So lieu "${num.value}${num.unit}" (entity: ${num.entity}, attr: ${num.attribute}) co trong Bank nhung KHONG xuat hien trong output`,',
    '          source  : `${num.value}${num.unit}`',
    '        });',
    '      }',
    '    }',
    '  }',
    '  if (numberMissed > 10) {',
    '    issues.push({',
    "      severity: 'CRITICAL',",
    "      type    : 'number_mass_missing',",
    '      message : `\u274c MASS NUMBER MISSING: ${numberMissed} so lieu trong Bank khong xuat hien trong output. Output co the la Outline.`',
    '    });',
    '  }',
    '',
    '  // Outline Detection: Phat hien output kieu muc luc',
    "  const allChaptersContent = (outputJson?.chapters || []).map(c => c.content || '').join(' ');",
    '  if (allChaptersContent.length > 0) {',
    "    const headingMatches       = allChaptersContent.match(/^#{1,3} .+/gm) || [];",
    "    const explanationSentences = allChaptersContent.match(/[^.!?]{30,}[.!?]/g) || [];",
    '    const ratioHE = headingMatches.length / Math.max(1, explanationSentences.length);',
    '    if (headingMatches.length >= 4 && ratioHE > 1.5) {',
    '      issues.push({',
    "        severity: 'CRITICAL',",
    "        type    : 'outline_detected',",
    '        message : `\u274c OUTLINE DETECTED: chapters[].content co ${headingMatches.length} headings nhung chi ${explanationSentences.length} cau giai thich (ty le ${ratioHE.toFixed(1)}). Output la DAN Y, khong phai Hoc Sau.`,',
    '        headings : headingMatches.length,',
    '        sentences: explanationSentences.length',
    '      });',
    '    } else if (headingMatches.length >= 3 && ratioHE > 1.0) {',
    '      issues.push({',
    "        severity: 'WARNING',",
    "        type    : 'shallow_content',",
    '        message : `\u26a0\ufe0f SHALLOW CONTENT: chapters[].content co ${headingMatches.length} headings voi chi ${explanationSentences.length} cau giai thich.`',
    '      });',
    '    }',
    '    for (const ch of (outputJson?.chapters || [])) {',
    "      const chContent = (ch.content || '').trim();",
    '      if (chContent.length < 50) {',
    '        issues.push({',
    "          severity: 'CRITICAL',",
    "          type    : 'empty_chapter',",
    '          message : `\u274c EMPTY CHAPTER: Chapter "${ch.title}" co noi dung qua ngan (${chContent.length} chars).`,',
    '          chapter_title: ch.title',
    '        });',
    '      }',
    '    }',
    '  } else if ((outputJson?.chapters || []).length > 0) {',
    '    issues.push({',
    "      severity: 'CRITICAL',",
    "      type    : 'empty_chapters',",
    '      message : `\u274c ALL CHAPTERS EMPTY: chapters[] co ${outputJson.chapters.length} phan nhung tat ca content deu rong.`',
    '    });',
    '  }',
    '',
    ''
  ].join('\n');

  code = code.replace(insertBefore, numberCoverageCode + '  ' + insertBefore.trim());
  patchCount++;
  console.log('[3/3] Patched deterministicValidate with Outline Detection + Number Coverage');
}

fs.writeFileSync('modules/docSummarizerEngine.js', code);
console.log('\nDone: ' + patchCount + '/3 patches applied.');
