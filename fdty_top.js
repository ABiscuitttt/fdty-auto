// fdty_top.js - 复旦体育理论考试 AI 自动答题（两阶段投票仲裁）
// 用法: 考试页面控制台粘贴执行
(function() {
  var T0 = Date.now();
  function ts() { return ((Date.now() - T0) / 1000).toFixed(1) + 's'; }

  // ============ 定位 paper frame ============
  var doc = document;
  try {
    var f = document.getElementById('paper') || document.querySelector('frame[name="paper"]') || window.frames['paper'];
    if (f) doc = f.contentDocument || f.contentWindow.document;
  } catch(e) {}
  if (!doc.getElementById('Panel3')) {
    for (var fi = 0; fi < window.frames.length; fi++) {
      try {
        var fd = window.frames[fi].document;
        if (fd.getElementById('Panel3')) { doc = fd; break; }
      } catch(e) {}
    }
  }

  // ============ 悬浮面板 ============
  var panel_el = doc.createElement('div');
  panel_el.id = 'fdty-panel';
  panel_el.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;background:#fff;color:#333;padding:8px 12px;border:1px solid #ccc;font:12px/1.5 monospace;min-width:220px;max-width:360px;pointer-events:none';
  panel_el.innerHTML = '<div id="fdty-msg"></div><div id="fdty-stream" style="color:#999;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow:hidden;margin-top:2px;padding-top:2px;border-top:1px dashed #ddd"></div><div id="fdty-progress" style="color:#999;font-size:11px"></div>';
  doc.body.appendChild(panel_el);
  var msg_el = doc.getElementById('fdty-msg');
  var stream_el = doc.getElementById('fdty-stream');
  var progress_el = doc.getElementById('fdty-progress');

  function log(msg, color) {
    console.log('[fdty] ' + msg);
    if (!color) color = '#333';
    var line = doc.createElement('div');
    line.style.color = color;
    line.textContent = msg;
    msg_el.appendChild(line);
  }

  function progress(msg) {
    console.log('[fdty] ' + msg);
    progress_el.textContent = msg;
  }

  function clearProgress() {
    progress_el.textContent = '';
  }

  function streamShow(text) {
    stream_el.textContent = text;
  }

  function streamAppend(text) {
    stream_el.textContent += text;
    stream_el.scrollTop = stream_el.scrollHeight;
  }

  function streamClear() {
    stream_el.textContent = '';
  }

  var API_KEY = window.__DEEPSEEK_KEY || '';
  var API_URL = 'https://api.deepseek.com/chat/completions';
  var ZHIPU_KEY = window.__ZHIPU_KEY || '';

  function webSearch(query) {
    if (!ZHIPU_KEY) return Promise.resolve([]);
    return fetch('https://open.bigmodel.cn/api/paas/v4/web_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ZHIPU_KEY },
      body: JSON.stringify({ search_query: query, search_engine: 'search_pro_quark', search_intent: false, count: 3, content_size: 'medium' })
    }).then(function(r) { return r.json(); }).then(function(d) {
      return (d.search_result || []).map(function(r) { return r.title + '\n  ' + r.content; });
    }).catch(function() { return []; });
  }

  var SYSTEM_PROMPT = [
    '你是一位复旦大学体育理论考试专业答题助手。',
    '',
    '## 知识范围',
    '运动生理学、体能训练理论、运动规则（篮球/排球/足球/田径/游泳/击剑等）、健康体能与体质评价、运动损伤预防、民族传统体育。',
    '',
    '## 答题步骤',
    '1. 仔细阅读题目，识别考点属于哪个知识领域',
    '2. 结合运动科学常识和体育规则进行推理判断',
    '3. 检查题干中是否有绝对化用词（"完全""绝不""一定""所有"），该类表述通常为错误',
    '4. 涉及具体年份、数据、百分比的事实题，严格对照已知知识点',
    '5. 注意否定词和双重否定，避免被题干迷惑',
    '6. 给出最终答案',
    '',
    '## 输出格式',
    '是非题回答"对"或"错"，单选题回答字母A/B/C/D。',
    '只输出纯JSON，不要markdown包裹，不要解释。',
    '示例: {"1":"对","2":"错","3":"C"}'].join('\n');

  var panel = doc.getElementById('Panel3');
  if (!panel) { log('Panel3 not found'); return; }

  // ============ 提取题目 ============
  function isGroupId(id) {
    return /^rep(?:Ver_rbtn_ver|Sin_RadioButtonList1)_\d+$/.test(id);
  }

  var questions = [], seen = {};

  var candidates = panel.querySelectorAll('[id^="repVer_rbtn_ver_"], [id^="repSin_RadioButtonList1_"]');
  for (var i = 0; i < candidates.length; i++) {
    var el = candidates[i];
    if (!isGroupId(el.id)) continue;
    var node = el.previousSibling;
    while (node) {
      if (node.nodeType === 3 && /\d/.test(node.textContent)) break;
      node = node.previousSibling;
    }
    if (!node) continue;
    var m = node.textContent.match(/(\d+)\s*\.\s*([\s\S]+?)\s*$/);
    if (!m) continue;
    var n = parseInt(m[1]);
    if (seen[n]) continue;
    seen[n] = true;
    questions.push({
      num: n,
      text: m[2].replace(/\s+/g, ' ').trim(),
      type: el.id.indexOf('Ver') !== -1 ? 'tf' : 'choice',
      id: el.id
    });
  }

  if (questions.length === 0) {
    var RE = /(\d+)\s*\.\s*([\s\S]+?)\s*<\w+\s+[^>]*\bid\s*=\s*["'](rep(?:Ver_rbtn_ver|Sin_RadioButtonList1)_\d+)["'][^>]*>/gi;
    var rm;
    while ((rm = RE.exec(panel.innerHTML))) {
      var rn = parseInt(rm[1]);
      if (seen[rn]) continue;
      seen[rn] = true;
      questions.push({
        num: rn,
        text: rm[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        type: rm[3].indexOf('Ver') !== -1 ? 'tf' : 'choice',
        id: rm[3]
      });
    }
  }

  questions.sort(function(a, b) { return a.num - b.num; });

  // ============ 加载章节摘要 ============
  var CHAPTERS_URL = 'https://fdty.oss-cn-beijing.aliyuncs.com/chapters_summary.md';
  var chaptersData = null;
  var relevanceMap = null;

  function fetchChapters() {
    return fetch(CHAPTERS_URL).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function(text) {
      chaptersData = parseSummary(text);
      log('加载 ' + chaptersData.length + ' 章知识库', '#1a73e8');
    }).catch(function() {
      log('知识库加载失败，使用无上下文模式');
    });
  }

  function parseSummary(text) {
    var blocks = text.split(/\n---\n/);
    var chapters = [];
    blocks.forEach(function(block) {
      var h2 = block.match(/^## (.+\.md)/m);
      var bold = block.match(/^\*\*(.+?)\*\*/m);
      var quote = block.match(/^> (.+)/m);
      var secs = [];
      var secMatch;
      var secRe = /^  - (.+)$/gm;
      while ((secMatch = secRe.exec(block)) !== null) {
        secs.push(secMatch[1]);
      }
      if (bold) {
        chapters.push({
          id: h2 ? h2[1] : '',
          title: bold[1],
          summary: quote ? quote[1] : '',
          sections: secs
        });
      }
    });
    return chapters;
  }

  function buildChapterIndex() {
    return chaptersData.map(function(ch) {
      return '## ' + ch.id + '\n摘要: ' + ch.summary + '\n章节: ' + ch.sections.join(', ');
    }).join('\n\n');
  }

  function phase0Mapping() {
    if (!chaptersData) return Promise.resolve(null);
    log('Phase 0: 分析章节相关性...', '#1a73e8');
    progress('Phase 0 分析中...');

    var userContent = '"""章节大纲"""\n' + buildChapterIndex() +
      '\n\n"""题目列表"""\n' + questions.map(function(q) {
        return '[' + q.num + '] ' + q.text;
      }).join('\n');

    var body = JSON.stringify({
      model: 'deepseek-v4-flash',
      temperature: 0.1,
      thinking: { type: 'disabled' },
      max_tokens: 2048,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: [
          '你是大学体育理论考试出题分析师。任务：根据题目内容，判断每道题出自教材的哪个章节。',
          '',
          '## 步骤',
          '1. 阅读题目，识别其考查的知识点',
          '2. 在章节大纲中匹配最相关的1-2个章节',
          '3. 输出关联结果',
          '',
          '## 规则',
          '- 每道题标记1-2个最相关的章节文件名',
          '- 只输出JSON，不要任何解释或markdown',
          '- 格式: {"题号":["文件名1.md","文件名2.md"]}',
          '- 示例: {"1":["第一章_体育概论与体育锻炼.md"],"2":["第六章_球类运动.md","第五章_田径.md"]}'
        ].join('\n') },
        { role: 'user', content: userContent }
      ]
    });

    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: body
    }).then(function(r) { return r.json(); })
      .then(function(d) {
        var content = (d.choices[0].message.content || '').trim();
        try { return JSON.parse(content); } catch(e) { return null; }
      }).catch(function() { return null; });
  }

  var fullChapters = {};

  function getKnowledge(q) {
    if (!relevanceMap) return '';
    var ids = relevanceMap[String(q.num)];
    if (!ids || !ids.length) return '';
    var parts = [];
    ids.forEach(function(id) {
      var text = fullChapters[id];
      if (text) parts.push(text.substring(0, 4000));
    });
    return parts.length ? '"""教材参考"""\n' + parts.join('\n\n---\n\n') + '\n"""教材参考结束"""\n\n' : '';
  }

  // ============ API 调用 ============
  function buildUserPrompt(qs, context) {
    context = context || '';
    return context + qs.map(function(q) {
      return '[' + q.num + '] (' + (q.type === 'tf' ? '判' : '选') + ') ' + q.text;
    }).join('\n');
  }

  function callAPI(qs, temp, context) {
    var body = JSON.stringify({
      model: 'deepseek-v4-flash',
      temperature: temp,
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(qs, context) }
      ]
    });

    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: body
    }).then(function(r) {
      if (!r.ok) return r.text().then(function(t) { throw new Error('HTTP ' + r.status); });
      return r.json();
    }).then(function(d) {
      var content = (d.choices[0].message.content || '').trim();
      if (content.slice(0, 3) === '```') content = content.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
      try { return JSON.parse(content); } catch(e) { return {}; }
    }).catch(function() { return {}; });
  }

  // ============ 选择答案 ============
  function selectAnswer(q, answer) {
    var group = doc.getElementById(q.id);
    if (!group) return false;
    var radios = group.querySelectorAll('input[type="radio"]');
    var idx;
    if (q.type === 'tf') {
      idx = /^(对|正确|是|true|T|yes|1)$/i.test(String(answer).trim()) ? 0 : 1;
    } else {
      idx = {A:0, B:1, C:2, D:3}[String(answer).trim().charAt(0).toUpperCase()];
    }
    if (idx !== undefined && radios[idx]) {
      radios[idx].checked = true;
      radios[idx].click();
      radios[idx].dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  // ============ Phase 1 & 2 ============
  function startVoting() {
    log(questions.length + ' 题 每题3票 共' + (questions.length*3) + '次并发' +
      (relevanceMap ? ' (RAG)' : ''), '#1a73e8');

    var totalOk = 0;
    var done1 = 0;
    var temps = [0.1, 0.6, 1.2];

    var phase1Jobs = questions.map(function(q) {
      var ctx = getKnowledge(q);
      var batch = [];
      for (var i = 0; i < 3; i++) batch.push(callAPI([q], temps[i], ctx));
      return Promise.all(batch).then(function(answers) {
        var counts = {};
        answers.forEach(function(a) {
          var ans = String(a[String(q.num)] || '').trim();
          if (ans) counts[ans] = (counts[ans] || 0) + 1;
        });
        var best = '', max = 0;
        Object.keys(counts).forEach(function(k) { if (counts[k] > max) { max = counts[k]; best = k; } });

        done1++;
        progress('投票 ' + done1 + '/' + questions.length + ' 完成');
        if (best && max === 3) {
          if (selectAnswer(q, best)) totalOk++;
        }
        return { q: q, best: best, count: max, counts: counts };
      });
    });

    Promise.all(phase1Jobs).then(function(results) {
      clearProgress();
      streamClear();

      var disputed = [];
      results.forEach(function(r) {
        if (!r.best || r.count < 3) disputed.push(r.q);
      });
      log('完成 ' + totalOk + '/' + questions.length + ' | 分歧' + disputed.length + ' | ' + ts(), '#1a73e8');

      if (disputed.length === 0) return;

      // ============ Phase 2: 分歧题搜索+仲裁 ============
      var done2 = 0;
      log('Phase 2 仲裁 ' + disputed.length + ' 题 (搜索+每题10次)...', '#e37400');

      var unresolved = [];
      var phase2Ok = 0;
      var phase2Jobs = disputed.map(function(q) {
        // 先搜索，拿到结果后再投票
        var searchQuery = q.text.replace(/[^一-龥a-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
        return webSearch(searchQuery).then(function(searchResults) {
          var searchCtx = searchResults.length ? '"""网络搜索参考"""\n' + searchResults.join('\n\n') + '\n"""搜索结束"""\n\n' : '';
          var ctx = getKnowledge(q) + searchCtx;

          var batch = [];
          for (var i = 0; i < 10; i++) batch.push(callAPI([q], 0.3, ctx));
          return Promise.all(batch).then(function(answers) {
            var counts = {};
            answers.forEach(function(a) {
              var ans = String(a[String(q.num)] || '').trim();
              if (ans) counts[ans] = (counts[ans] || 0) + 1;
            });
            var best = '', max = 0;
            Object.keys(counts).forEach(function(k) { if (counts[k] > max) { max = counts[k]; best = k; } });

            done2++;
            progress('仲裁 ' + done2 + '/' + disputed.length + ' 完成');
            if (best && max >= 8) {
              if (selectAnswer(q, best)) { totalOk++; phase2Ok++; }
            } else {
              unresolved.push({ q: q, best: best, count: max, counts: counts });
            }
          });
        });
      });

      return Promise.all(phase2Jobs).then(function() {
        clearProgress();
        streamClear();
        if (unresolved.length > 0) {
          unresolved.forEach(function(r) {
            var parts = [];
            Object.keys(r.counts).sort().forEach(function(ans) { parts.push(ans + ':' + r.counts[ans]); });
            var line = '#' + r.q.num + ' ' + r.q.text.slice(0, 50) + ' → ' + parts.join(', ');
            log(line, '#c62828');
            console.warn('[fdty] [' + r.q.num + '] ' + r.q.text + '\n    票数: ' + parts.join(', '));
          });
        }
        log('完成 ' + totalOk + '/' + questions.length +
          ' (仲裁' + phase2Ok + ', 未定' + unresolved.length + ') | ' + ts(), '#1a73e8');
      });
    }).catch(function(e) {
      log('错误: ' + e.message);
      console.error('[fdty]', e);
    });
  }

  // ============ 启动 ============
  function loadFullChapters(map) {
    if (!map) return Promise.resolve();
    var ids = {};
    Object.keys(map).forEach(function(k) {
      (map[k] || []).forEach(function(id) { ids[id] = true; });
    });
    var needed = Object.keys(ids);
    if (!needed.length) return Promise.resolve();
    progress('加载教材章节...');
    return Promise.all(needed.map(function(id) {
      var url = 'https://fdty.oss-cn-beijing.aliyuncs.com/chapters/' + id;
      return fetch(url).then(function(r) { return r.text(); }).then(function(t) {
        fullChapters[id] = t;
      }).catch(function() {});
    })).then(function() {
      log('加载 ' + Object.keys(fullChapters).length + ' 章教材内容');
    });
  }

  fetchChapters().then(function() {
    return phase0Mapping();
  }).then(function(map) {
    relevanceMap = map;
    return loadFullChapters(map);
  }).then(function() {
    clearProgress();
    startVoting();
  });
})();
