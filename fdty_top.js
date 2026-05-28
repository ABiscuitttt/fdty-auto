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

  var SYSTEM_PROMPT = [
    '你是复旦大学体育理论考试专业答题助手。考试内容涵盖运动生理学、体能训练理论及专项运动规则。',
    '',
    '答题原则：',
    '1. 根据运动科学常识和体育规则判断正误，不要凭直觉猜测',
    '2. 注意题目中的绝对化用词（"完全""绝不""一定""所有"），此类表述通常为错',
    '3. 涉及具体年份、数据、百分比的事实题，仔细核对自己的知识点',
    '4. 注意否定词和双重否定，避免被题干迷惑',
    '',
    '是非题回答"对"或"错"，单选题回答字母A/B/C/D。',
    '只输出纯JSON，格式: {"题号":"答案",...}，不要markdown包裹，不要解释。'
  ].join('\n');

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
  log(questions.length + ' 题  Phase 1 投票中...', '#1a73e8');

  // ============ API 调用 ============
  function buildUserPrompt(qs) {
    return qs.map(function(q) {
      return '[' + q.num + '] (' + (q.type === 'tf' ? '判' : '选') + ') ' + q.text;
    }).join('\n');
  }

  function callAPI(qs, temp) {
    var body = JSON.stringify({
      model: 'deepseek-v4-flash',
      temperature: temp,
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(qs) }
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

  // ============ Phase 1: 逐题投票，每题3票并发 ============
  var totalOk = 0;
  var done1 = 0;
  var temps = [0.5 + Math.random() * 0.4, 0.5 + Math.random() * 0.4, 0.5 + Math.random() * 0.4];
  log(questions.length + ' 题 每题3票 共' + (questions.length*3) + '次并发...', '#1a73e8');

  var phase1Jobs = questions.map(function(q) {
    var batch = [];
    for (var i = 0; i < 3; i++) batch.push(callAPI([q], temps[i]));
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

    // ============ Phase 2: 分歧题逐题10次仲裁 ============
    var done2 = 0;
    log('Phase 2 仲裁 ' + disputed.length + ' 题 (每题10次)...', '#e37400');

    var unresolved = [];
    var phase2Ok = 0;
    var phase2Jobs = disputed.map(function(q) {
      var batch = [];
      for (var i = 0; i < 10; i++) batch.push(callAPI([q], 0.7));
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
})();
