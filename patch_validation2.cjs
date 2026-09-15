const fs = require('fs');
let code = fs.readFileSync('modules/docSummarizerEngine.js', 'utf8');

// Locate the start of deterministicValidate closing block
// We'll find the unique phrase "Fact Utilization Check" block which precedes the criticalCount
// and inject our new checks AFTER the Fact Utilization block but BEFORE the criticalCount lines.
const MARKER_START = '  // ── Fact Utilization Check';
const MARKER_END   = '\n  const criticalCount = issues.filter';

const idxStart = code.indexOf(MARKER_START);
const idxEnd   = code.indexOf(MARKER_END, idxStart);

if (idxStart === -1 || idxEnd === -1) {
  console.error('Could not find insertion marker in deterministicValidate. Aborting.');
  process.exit(1);
}

// Check if already patched
if (code.indexOf('outline_detected') !== -1) {
  console.log('Already patched (outline_detected exists). Skipping validation injection.');
  process.exit(0);
}

// The text from fact utilization block end to criticalCount
// We insert after the fact utilization closing brace (after line "  }\n")
// Find the closing "  }\n\n" of the utilizationMissed loop
const utilizationCloser = '\n  }\n\n';
const idxAfterUtil = code.indexOf(utilizationCloser, idxStart) + utilizationCloser.length;

const insertionCode = `
  // ── Number Coverage: tất cả số liệu trong Bank phải xuất hiện trong Final Output ──
  let numberMissed = 0;
  for (const numCov of bank.numbers) {
    if (!numCov.value || !numCov.unit) continue;
    const valNorm    = String(numCov.value).replace(/[.,]/g, '[.,]?').replace(/[-\u2013~]/g, '[-\u2013~]');
    const unitNorm   = String(numCov.unit).replace(/[.*+?^${}()|[\]\\µ]/g, '\\$&');
    const reExact    = new RegExp(valNorm + '\\s*' + unitNorm, 'i');
    if (!reExact.test(outputStr)) {
      numberMissed++;
      if (numberMissed <= 10) {
        issues.push({
          severity: 'CRITICAL',
          type    : 'number_missing_from_output',
          fact_id : numCov.fact_id,
          message : '❌ NUMBER MISSING: "' + numCov.value + numCov.unit + '" (entity: ' + numCov.entity + ', attr: ' + numCov.attribute + ') có trong Bank nhưng KHÔNG xuất hiện trong output',
          source  : numCov.value + numCov.unit
        });
      }
    }
  }
  if (numberMissed > 10) {
    issues.push({
      severity: 'CRITICAL',
      type    : 'number_mass_missing',
      message : '❌ MASS NUMBER MISSING: ' + numberMissed + ' số liệu trong Bank không xuất hiện trong output. Output có thể là Outline.'
    });
  }

  // ── Outline Detection: phát hiện output kiểu mục lục ─────────────────────────
  const allChapterContent = (outputJson && outputJson.chapters || []).map(function(c) { return c.content || ''; }).join(' ');
  if (allChapterContent.length > 0) {
    const headingM = allChapterContent.match(/^#{1,3} .+/gm) || [];
    const explainM = allChapterContent.match(/[^.!?]{30,}[.!?]/g) || [];
    const ratioHE  = headingM.length / Math.max(1, explainM.length);

    if (headingM.length >= 4 && ratioHE > 1.5) {
      issues.push({
        severity : 'CRITICAL',
        type     : 'outline_detected',
        message  : '❌ OUTLINE DETECTED: chapters[].content có ' + headingM.length + ' headings nhưng chỉ ' + explainM.length + ' câu giải thích (tỷ lệ ' + ratioHE.toFixed(1) + '). Output là DÀN Ý, không phải Học Sâu.',
        headings : headingM.length,
        sentences: explainM.length
      });
    } else if (headingM.length >= 3 && ratioHE > 1.0) {
      issues.push({
        severity: 'WARNING',
        type    : 'shallow_content',
        message : '⚠️ SHALLOW CONTENT: chapters[].content có ' + headingM.length + ' headings với chỉ ' + explainM.length + ' câu giải thích (tỷ lệ ' + ratioHE.toFixed(1) + ').'
      });
    }

    (outputJson && outputJson.chapters || []).forEach(function(ch) {
      const chContent = (ch.content || '').trim();
      if (chContent.length < 50) {
        issues.push({
          severity     : 'CRITICAL',
          type         : 'empty_chapter',
          message      : '❌ EMPTY CHAPTER: Chapter "' + ch.title + '" có nội dung quá ngắn (' + chContent.length + ' chars) — Chapter rỗng không phải Học Sâu.',
          chapter_title: ch.title
        });
      }
    });
  } else if ((outputJson && outputJson.chapters || []).length > 0) {
    issues.push({
      severity: 'CRITICAL',
      type    : 'empty_chapters',
      message : '❌ ALL CHAPTERS EMPTY: chapters[] có ' + (outputJson.chapters || []).length + ' phần nhưng tất cả content đều rỗng.'
    });
  }

`;

code = code.slice(0, idxAfterUtil) + insertionCode + code.slice(idxAfterUtil);
fs.writeFileSync('modules/docSummarizerEngine.js', code);
console.log('Patched deterministicValidate: Number Coverage + Outline Detection injected successfully.');
