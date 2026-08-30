(function () {
  'use strict';

  var SECTION_STYLE = {
    '模型发布/更新': '#4f46e5',
    '产品发布/更新': '#0d9488',
    '行业动态': '#b45309',
    '论文研究': '#7c3aed',
    '技巧与观点': '#be123c'
  };
  var FALLBACK_AC = '#475569';
  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  var $ = function (id) { return document.getElementById(id); };
  var indexData = null;
  var monthCache = {};
  var observer = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dateCn(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日 ' + WEEK[d.getDay()];
  }

  function fail(msg, detail) {
    var el = $('state');
    el.className = 'state err';
    el.innerHTML = '<b>' + esc(msg) + '</b><br>' + detail;
    $('main').style.display = '';
  }

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' · ' + url);
      return r.json();
    });
  }

  function loadIndex() {
    if (indexData) return Promise.resolve(indexData);
    return getJSON('data/index.json').then(function (d) { indexData = d; return d; });
  }

  function loadMonth(month) {
    if (monthCache[month]) return Promise.resolve(monthCache[month]);
    return getJSON('data/' + month + '.json').then(function (d) {
      monthCache[month] = d.days;
      return d.days;
    });
  }

  function targetDate(idx) {
    var h = (location.hash || '').replace(/^#/, '');
    for (var i = 0; i < idx.days.length; i++) {
      if (idx.days[i].date === h) return h;
    }
    return idx.latest;
  }

  function renderNav(idx, date) {
    var days = idx.days;
    var sel = $('selDate');
    sel.innerHTML = days.map(function (d) {
      return '<option value="' + esc(d.date) + '"' + (d.date === date ? ' selected' : '') +
        '>' + esc(d.date) + ' · ' + d.total + ' 条</option>';
    }).join('');
    var i = -1;
    for (var k = 0; k < days.length; k++) { if (days[k].date === date) { i = k; break; } }
    // days 按日期倒序：索引越大越早
    $('btnPrev').disabled = (i < 0 || i === days.length - 1);
    $('btnNext').disabled = (i <= 0);
  }

  function go(date) {
    if (location.hash === '#' + date) { render(date); return; }
    location.hash = date;
  }

  function render(date) {
    loadIndex().then(function (idx) {
      renderNav(idx, date);
      return loadMonth(date.slice(0, 7)).then(function (days) {
        var day = days[date];
        if (!day) throw new Error('本期数据缺失：' + date);
        paint(idx, day);
      });
    }).catch(function (e) {
      fail('数据加载失败。', '如果你是用 <code>file://</code> 直接双击打开的，浏览器会拦截本地 JSON 读取。' +
        '请用 <code>python3 -m http.server</code> 起个本地服务后访问 http 地址。<br>错误详情：' + esc(e.message));
    });
  }

  function paint(idx, day) {
    var total = day.sections.reduce(function (n, s) { return n + s.items.length; }, 0);

    $('hDate').textContent = dateCn(day.date);
    $('mGen').textContent = day.generatedAtText || '—';
    $('mWin').textContent = day.windowText || '—';
    document.title = 'AI 日报 · ' + day.date;

    var lead = '';
    for (var i = 0; i < day.sections.length && !lead; i++) {
      if (day.sections[i].items.length) lead = day.sections[i].items[0].title;
    }
    $('mLead').textContent = lead;

    $('sTotal').textContent = total;
    $('fTotal').textContent = total;
    $('fGen').textContent = day.generatedAtText ? ('本期生成于 ' + day.generatedAtText + '（北京时间）') : '';
    var fl = $('fLink');
    fl.href = day.dailyUrl || 'https://aihot.virxact.com';
    fl.textContent = 'AIHOT 日报（' + day.date + '）';

    var fShot = $('fShot');
    var shots = null;
    for(var k=0; k<idx.days.length; k++){
      if(idx.days[k].date === day.date){ shots = idx.days[k].shots; break; }
    }
    if(shots && shots.preview){
      var gridInfo = (shots.grid ? (shots.grid.length + ' 张分页图') : '') +
                     (shots.long ? (shots.grid ? ' + 1 张超长图' : '1 张超长图') : '');
      fShot.innerHTML = '<a class="shot-btn" href="' + esc(shots.preview) +
        '" target="_blank" rel="noopener noreferrer">查看本期长图 → ' +
        '<span class="shot-tag">' + esc(gridInfo) + '</span></a>';
    }else{
      fShot.innerHTML = '';
    }

    $('sStats').innerHTML = day.sections.map(function (s) {
      return '<div class="stat" style="--ac:' + (SECTION_STYLE[s.label] || FALLBACK_AC) + '">' +
        '<span class="stat-n">' + s.items.length + '</span>' +
        '<span class="stat-l">' + esc(s.label) + '</span></div>';
    }).join('');

    // 版块锚点导航
    $('secNav').innerHTML = day.sections.map(function (s, i) {
      return '<a class="nav-i" href="#sec-' + (i + 1) + '" data-target="sec-' + (i + 1) +
        '" style="--ac:' + (SECTION_STYLE[s.label] || FALLBACK_AC) + '">' +
        esc(s.label) + '<em>' + s.items.length + '</em></a>';
    }).join('');

    // 正文：全局连续编号，跨版块不重置
    var n = 0;
    var html = day.sections.map(function (s, si) {
      var ac = SECTION_STYLE[s.label] || FALLBACK_AC;
      var cards = s.items.map(function (it) {
        n += 1;
        var ghost = it.aihot
          ? '<a class="c-ghost" href="' + esc(it.aihot) + '" target="_blank" rel="noopener noreferrer">AIHOT</a>'
          : '';
        var more = it.original
          ? '<a class="c-more" href="' + esc(it.original) + '" target="_blank" rel="noopener noreferrer">阅读原文 →</a>'
          : '';
        return '<article class="card">' +
          '<div class="c-top"><span class="c-num">' + (n < 10 ? '0' + n : n) + '</span>' +
          '<span class="c-src">' + esc(it.source) + '</span></div>' +
          '<h3 class="c-title">' + esc(it.title) + '</h3>' +
          '<p class="c-sum">' + esc(it.brief) + '</p>' +
          '<div class="c-foot"><time class="c-time">' + esc(it.timeText) + '</time>' +
          '<span class="c-links">' + more + ghost + '</span></div>' +
          '</article>';
      }).join('');
      if (!cards) cards = '<p class="empty">本期该版块没有入选条目。</p>';
      return '<section class="sec" id="sec-' + (si + 1) + '" style="--ac:' + ac + '">' +
        '<h2 class="sec-h"><span class="sec-dot"></span>' + esc(s.label) +
        '<em>' + s.items.length + '</em></h2>' +
        '<div class="grid">' + cards + '</div></section>';
    }).join('');

    $('main').innerHTML = html;
    bindSpy();
  }

  function bindSpy() {
    if (observer) observer.disconnect();
    var links = [].slice.call(document.querySelectorAll('.nav-i'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('on', a.dataset.target === e.target.id); });
      });
    }, { rootMargin: '-130px 0px -65% 0px', threshold: 0 });
    links.forEach(function (a) {
      var t = document.getElementById(a.dataset.target);
      if (t) observer.observe(t);
    });
  }

  $('selDate').addEventListener('change', function () { go(this.value); });
  $('btnPrev').addEventListener('click', function () { step(1); });
  $('btnNext').addEventListener('click', function () { step(-1); });

  function step(delta) {
    if (!indexData) return;
    var days = indexData.days;
    var cur = targetDate(indexData);
    for (var k = 0; k < days.length; k++) {
      if (days[k].date === cur) {
        var t = days[k + delta];
        if (t) go(t.date);
        return;
      }
    }
  }

  window.addEventListener('hashchange', function () {
    loadIndex().then(function (idx) { render(targetDate(idx)); });
  });

  loadIndex().then(function (idx) {
    render(targetDate(idx));
  }).catch(function (e) {
    fail('期数清单加载失败。', '请用 http 方式访问（<code>python3 -m http.server</code>），' +
      '<code>file://</code> 下浏览器会拦截本地 JSON 读取。<br>错误详情：' + esc(e.message));
  });
})();
