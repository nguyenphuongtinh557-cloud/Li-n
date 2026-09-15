const fs = require('fs');
let code = fs.readFileSync('modules/docSummarizerEngine.js', 'utf8');

const targetRegex = /function _fallbackSynthesis\(bank\) \{[\s\S]*?is_complete: false\r?\n\s+\}\r?\n\s+\};\r?\n\}/m;

const replacement = `function _fallbackSynthesis(bank) {
  const concepts = [];
  const entityMap = {};

  for (const fact of bank.facts) {
    const key = fact.entity || 'Khác';
    if (!entityMap[key]) {
      entityMap[key] = { name: key, tier: 'B', definition: '', attributes: [], conditions_exceptions: [], key_facts: [], numbers: [], citations: [] };
      concepts.push(entityMap[key]);
    }
    if (fact.type === 'definition') {
      entityMap[key].definition = fact.content || '';
    }
    if (fact.value && fact.unit) {
      entityMap[key].numbers.push(\`\${fact.attribute}: \${fact.value}\${fact.unit}\${fact.qualifier ? ' (' + fact.qualifier + ')' : ''}\`);
    } else if (fact.content) {
      entityMap[key].key_facts.push(fact.content);
    }
    entityMap[key].citations.push({ text_span: fact.source_quote || '', fact_ids: [fact.fact_id] });
  }

  // Tạo chapters bằng cách gộp facts theo sections để có nội dung "học được"
  const chapters = [];
  for (const section of bank.sections) {
    const sectionFacts = bank.facts.filter(f => 
      (section.fact_ids || []).includes(f.fact_id) || 
      (_normalizeText(f.source_location || '').includes(_normalizeText(section.title)))
    );
    
    if (sectionFacts.length === 0) continue;
    
    let contentMarkdown = \`## \${section.title}\\n\\n\`;
    
    // Tìm definitions
    const definitions = sectionFacts.filter(f => f.type === 'definition');
    for (const def of definitions) {
      contentMarkdown += \`\${def.content}\\n\\n\`;
    }
    
    // Tìm các thực thể có số liệu
    const numFacts = sectionFacts.filter(f => f.value && f.unit);
    if (numFacts.length > 0) {
      contentMarkdown += \`### Các thông số quan trọng\\n\`;
      for (const nf of numFacts) {
        contentMarkdown += \`- **\${nf.entity}** (\${nf.attribute}): \${nf.value} \${nf.unit} \${nf.qualifier ? '(' + nf.qualifier + ')' : ''}\\n\`;
      }
      contentMarkdown += \`\\n\`;
    }
    
    // Các fact khác
    const otherFacts = sectionFacts.filter(f => f.type !== 'definition' && (!f.value || !f.unit));
    if (otherFacts.length > 0) {
      contentMarkdown += \`### Đặc điểm chính\\n\`;
      for (const ofact of otherFacts) {
        if (ofact.content) contentMarkdown += \`- \${ofact.content}\\n\`;
      }
      contentMarkdown += \`\\n\`;
    }
    
    chapters.push({ title: section.title, content: contentMarkdown.trim() });
  }

  // Đề phòng bank.sections bị trống
  if (chapters.length === 0 && bank.facts.length > 0) {
    let fallbackContent = \`## Tổng hợp kiến thức\\n\\n\`;
    for (const f of bank.facts) {
      if (f.value && f.unit) {
        fallbackContent += \`- **\${f.entity}** (\${f.attribute}): \${f.value} \${f.unit}\\n\`;
      } else if (f.content) {
        fallbackContent += \`- \${f.content}\\n\`;
      }
    }
    chapters.push({ title: "Tổng hợp", content: fallbackContent.trim() });
  }

  return {
    overview: \`Tài liệu "\${bank.chunkCount} phần" đã được trích xuất với \${bank.facts.length} facts. (Bản Fallback)\`,
    chapters,
    concepts,
    mechanisms: bank.mechanisms.map(m => ({
      name: m.name,
      steps: m.steps.map(s => \`Bước \${s.step}: \${s.description}\`),
      source_explicit: m.source_explicit,
      citations: []
    })),
    comparisons: [],
    domain_apps: bank.domain_expansions.map(d => ({
      source_fact_id: d.source_fact_id,
      source_fact_summary: bank.facts.find(f => f.fact_id === d.source_fact_id)?.attribute || '',
      expansion_type: d.expansion_type,
      content: d.content
    })),
    key_points: [],
    pitfalls: [],
    questions: [],
    coverage_note: {
      sections_covered: bank.sections.map(s => s.title),
      sections_missing: [],
      is_complete: false
    }
  };
}`;

if (targetRegex.test(code)) {
  code = code.replace(targetRegex, replacement);
  fs.writeFileSync('modules/docSummarizerEngine.js', code);
  console.log('Patched _fallbackSynthesis successfully!');
} else {
  console.error('Target not found for fallback synthesis patch!');
}
