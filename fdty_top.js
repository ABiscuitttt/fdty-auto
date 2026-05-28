// fdty_top.js - 复旦体育理论考试 AI 自动答题（两阶段投票仲裁）
// 用法: 考试页面控制台粘贴执行
(function() {
  var T0 = Date.now();
  function ts() { return ((Date.now() - T0) / 1000).toFixed(1) + 's'; }

  var API_KEY = window.__DEEPSEEK_KEY || '';
  var API_URL = 'https://api.deepseek.com/v1/chat/completions';

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

  // ============ 定位 paper frame ============
  var doc = document;
  try {
    var f = document.getElementById('paper') || document.querySelector('frame[name="paper"]') || window.frames['paper'];
    if (f) doc = f.contentDocument || f.contentWindow.document;
  } catch(e) {}

  var panel = doc.getElementById('Panel3');
  if (!panel) return console.error('[fdty] Panel3 not found');

  // ============ 提取题目 (DOM 遍历 + 正则兜底) ============
  function isGroupId(id) {
    return /^rep(?:Ver_rbtn_ver|Sin_RadioButtonList1)_\d+$/.test(id);
  }

  var questions = [], seen = {};

  // Method 1: DOM 遍历 — 找所有 group 元素，向前找兄弟文本节点
  var candidates = panel.querySelectorAll('[id^="repVer_rbtn_ver_"], [id^="repSin_RadioButtonList1_"]');
  for (var i = 0; i < candidates.length; i++) {
    var el = candidates[i];
    if (!isGroupId(el.id)) continue;  // 过滤子元素 (radio inputs)

    // 向前找包含数字的文本节点
    var node = el.previousSibling;
    while (node) {
      if (node.nodeType === 3 && /\d/.test(node.textContent)) break;  // TEXT_NODE
      node = node.previousSibling;
    }
    if (!node) continue;

    // 从文本节点末尾提取 "题号 . 题目文本"
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

  // Method 2: 正则兜底 — innerHTML 匹配 (处理 DOM 遍历遗漏)
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

  var numTF = questions.filter(function(q) { return q.type === 'tf'; }).length;
  var numChoice = questions.filter(function(q) { return q.type === 'choice'; }).length;
  questions.sort(function(a, b) { return a.num - b.num; });
  console.log('[fdty] ' + ts() + ' 提取 ' + questions.length + ' 题 (判断' + numTF + ' + 单选' + numChoice + ', DOM:' + (questions.length > 0 && isGroupId(questions[0].id) ? 'yes' : 'regex') + ')');
  console.log('[fdty] 模型: deepseek-v4-flash | Key: ' + API_KEY.slice(0,8) + '***');

  // ============ API 调用 ============
  var apiCallCount = 0;
  function buildUserPrompt(qs) {
    return qs.map(function(q) {
      return '[' + q.num + '] (' + (q.type === 'tf' ? '判' : '选') + ') ' + q.text;
    }).join('\n');
  }

  function callAPI(qs, temp) {
    var t0 = Date.now();
    apiCallCount++;
    var label = 'API#' + apiCallCount + ' (' + qs.length + '题, temp=' + temp.toFixed(2) + ')';
    console.log('[fdty] ' + ts() + ' ' + label + ' 发送...');
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        temperature: temp,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(qs) }
        ]
      })
    }).then(function(r) {
      if (!r.ok) return r.text().then(function(t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0,200)); });
      return r.json();
    }).then(function(d) {
      var content = (d.choices[0].message.content || '').trim();
      var elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      var tokenInfo = d.usage ? ' | tokens: ' + d.usage.prompt_tokens + '+' + d.usage.completion_tokens + '=' + d.usage.total_tokens : '';
      if (!content) {
        console.warn('[fdty] ' + ts() + ' ' + label + ' 完成 ' + elapsed + 's, 空响应!' + tokenInfo);
        return {};
      }
      if (content.slice(0, 3) === '```') content = content.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
      try {
        var obj = JSON.parse(content);
        var keys = Object.keys(obj).length;
        console.log('[fdty] ' + ts() + ' ' + label + ' 完成 ' + elapsed + 's, 解析 ' + keys + ' 个答案' + tokenInfo);
        return obj;
      } catch(e) {
        console.warn('[fdty] ' + ts() + ' ' + label + ' 完成 ' + elapsed + 's, JSON解析失败: ' + content.slice(0,80) + tokenInfo);
        return {};
      }
    }).catch(function(e) {
      console.error('[fdty] ' + ts() + ' ' + label + ' 失败: ' + e.message);
      return {};
    });
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

  // ============ Phase 1: 分组并发投票 ============
  var CHUNK_SIZE = 15;
  var chunks = [];
  for (var i = 0; i < questions.length; i += CHUNK_SIZE) {
    chunks.push(questions.slice(i, i + CHUNK_SIZE));
  }
  var temps = [0.5 + Math.random() * 0.4, 0.5 + Math.random() * 0.4, 0.5 + Math.random() * 0.4];
  console.log('[fdty] ' + ts() + ' Phase 1 ' + questions.length + '题 → ' + chunks.length + '组×3票, 共' + (chunks.length*3) + '次并发 (temp=' + temps.map(function(t) { return t.toFixed(2); }).join(',') + ')');

  var phase1Calls = [];
  chunks.forEach(function(chunk) {
    temps.forEach(function(temp) {
      phase1Calls.push(callAPI(chunk, temp));
    });
  });

  Promise.all(phase1Calls).then(function(allResults) {
    // allResults: [chunk0_temp0, chunk0_temp1, chunk0_temp2, chunk1_temp0, ...]
    // 合并为每题的 3 票
    var votes = {};
    questions.forEach(function(q) {
      votes[String(q.num)] = [];
    });

    chunks.forEach(function(chunk, ci) {
      temps.forEach(function(temp, ti) {
        var result = allResults[ci * temps.length + ti];
        chunk.forEach(function(q) {
          var ans = String(result[String(q.num)] || '').trim();
          votes[String(q.num)].push(ans);
        });
      });
    });

    var agreed = [], disputed = [];
    var emptyCount = 0;
    questions.forEach(function(q) {
      var key = String(q.num);
      var v = votes[key];
      if (!v[0] && !v[1] && !v[2]) {
        emptyCount++;
      }
      if (v[0] && v[0] === v[1] && v[1] === v[2]) {
        agreed.push({ q: q, ans: v[0] });
      } else {
        disputed.push(q);
      }
    });

    // 全票一致的直接选
    var totalOk = 0;
    agreed.forEach(function(item) {
      if (selectAnswer(item.q, item.ans)) totalOk++;
    });
    console.log('[fdty] ' + ts() + ' Phase 1 一致:' + agreed.length + ' 已选 | 分歧:' + disputed.length + ' | 全空:' + emptyCount);

    if (disputed.length === 0) {
      console.log('[fdty] ' + ts() + ' 完成 ' + totalOk + '/' + questions.length);
      return;
    }

    // ============ Phase 2: 逐题仲裁，流式输出 ============
    var unresolved = [];
    var phase2Done = 0, phase2Ok = 0;
    console.log('[fdty] Phase 2 开始 (' + disputed.length + '题, 每题10次请求)...');

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

        phase2Done++;
        if (best && max >= 8) {
          if (selectAnswer(q, best)) { totalOk++; phase2Ok++; }
          console.log('[fdty] ✅ #' + q.num + ' → ' + best + ' (' + max + '/10票) [' + phase2Done + '/' + disputed.length + ']');
        } else {
          unresolved.push({ q: q, best: best, count: max, counts: counts });
          console.log('[fdty] ❓ #' + q.num + ' ' + (best||'?') + '(' + max + '/10) [' + phase2Done + '/' + disputed.length + ']');
        }
      });
    });

    return Promise.all(phase2Jobs).then(function() {
      if (unresolved.length > 0) {
        console.warn('[fdty] === 以下 ' + unresolved.length + ' 题无法确定，需人工判断 ===');
        unresolved.forEach(function(r) {
          var parts = [];
          Object.keys(r.counts).sort().forEach(function(ans) { parts.push(ans + ':' + r.counts[ans]); });
          console.warn('  [' + r.q.num + '] [' + (r.q.type === 'tf' ? '判' : '选') + '] ' + r.q.text + '\n    票数: ' + parts.join(', '));
        });
        console.warn('[fdty] ==========================================');
      }
      console.log('[fdty] ' + ts() + ' 完成 ' + totalOk + '/' + questions.length +
        ' (一致' + agreed.length + ' + 仲裁' + phase2Ok + ', 未定' + unresolved.length + ', 共' + apiCallCount + '次API)');
    });
  }).catch(function(e) {
    console.error('[fdty]', e);
  });
})();
