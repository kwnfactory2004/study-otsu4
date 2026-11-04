import { CUTOFF, NOTICE, SUBJECTS, buildQueue, cleanRecords, fieldStat, fieldsOf, recordAnswer, subjectName, subjectStats, toggleFlag } from './stats.js';
import { resolvePage } from './route.js';
import { LoadError, errorMessage } from './messages.js';

const RECORDS_KEY = 'studyotsu4.v1';
const FLAGS_KEY = 'studyotsu4.flags.v1';
const KIND_KEY = 'studyotsu4.kind';
const TAP_GUARD_MS = 400; // 問題が切り替わった直後のタップは受け付けない
const app = document.getElementById('app');

const state = {
  questions: [],
  records: {},
  flags: [],
  kind: 'law',
  storageOk: true,
  queue: [],
  subject: 'law',
  index: 0,
  results: [],
  answered: false,
  inQuiz: false,
  current: null,
  readyAt: 0,
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// 保存データが壊れていても、その項目だけ初期状態に戻して起動する
function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    if (e instanceof SyntaxError) return null; // 中身が壊れている
    throw e;
  }
}

function loadRecords() {
  try {
    state.records = cleanRecords(readJson(RECORDS_KEY));
    const flags = readJson(FLAGS_KEY);
    state.flags = Array.isArray(flags) ? flags.filter((f) => typeof f === 'string') : [];
    const kind = localStorage.getItem(KIND_KEY);
    if (kind && Object.hasOwn(SUBJECTS, kind)) state.kind = kind;
  } catch {
    state.records = {};
    state.flags = [];
    state.storageOk = false;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    state.storageOk = false;
  }
}
const saveRecords = () => save(RECORDS_KEY, JSON.stringify(state.records));
const saveKind = () => save(KIND_KEY, state.kind);
const saveFlags = () => save(FLAGS_KEY, JSON.stringify(state.flags));

export async function loadQuestions() {
  const res = await fetch('data/questions.json', { cache: 'no-cache' });
  if (!res.ok) throw new LoadError('data/questions.json', res.status);
  const list = await res.json();
  if (!Array.isArray(list)) throw new TypeError('questions.json is not a list');
  return list.filter((q) => q && Object.hasOwn(SUBJECTS, q.subject) && typeof q.id === 'string' &&
    Array.isArray(q.choices) && q.choices.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3);
}

// 画面の上に常に出す注意書き
function noticeBar() {
  return `<p class="notice" id="ai-notice" role="note">${esc(NOTICE)}</p>`;
}

function storageNotice() {
  return state.storageOk ? '' : '<p class="notice">このブラウザには記録を保存できません。問題は解けますが、成績は残りません。</p>';
}

function renderError(error) {
  app.innerHTML = `${noticeBar()}<div class="card narrow">
    <h1>読み込めませんでした</h1>
    <p>${esc(errorMessage(error))}</p>
    <button class="primary full" id="reload">再読み込み</button>
  </div>`;
  document.getElementById('reload').onclick = () => location.reload();
}

function statTile(label, stat, attr = '') {
  const value = stat.rate === null ? '—' : Math.round(stat.rate * 100);
  const unit = stat.rate === null ? '' : '<span class="unit">%</span>';
  const note = stat.rate === null ? 'まだ解いていません'
    : stat.belowCutoff ? `目安の${Math.round(CUTOFF * 100)}%を下回っています（${stat.attempts}回）` : `${stat.attempts}回解答`;
  const tag = attr ? 'button' : 'div';
  return `<${tag} class="card tile ${stat.belowCutoff ? 'warn' : ''}" ${attr}>
    <div class="label">${esc(label)}</div>
    <div class="value">${value}${unit}</div>
    <div class="state">${esc(note)}</div>
  </${tag}>`;
}

function flagLabel(id) {
  const q = state.questions.find((x) => x.id === id);
  return q ? `${subjectName(q.subject)}・${q.field}（${id}）` : id;
}

function renderHome() {
  const kind = state.kind;
  const info = SUBJECTS[kind];
  const stats = subjectStats(state.records, state.questions);
  const inKind = state.questions.filter((q) => q.subject === kind);
  const wrongCount = inKind.filter((q) => state.records[q.id]?.last === false).length;
  app.innerHTML = `${noticeBar()}${storageNotice()}
    <h1>Study OTSU4</h1>
    <p class="sub">乙種第4類危険物取扱者。各科目${Math.round(CUTOFF * 100)}%以上が合格の目安です</p>
    <div class="chips kinds" role="group" aria-label="科目">${Object.entries(SUBJECTS).map(([k, s]) =>
      `<button type="button" class="chip kind ${k === kind ? 'on' : ''}" data-kind="${k}" aria-pressed="${k === kind}">${esc(s.name)}</button>`).join('')}</div>
    <div class="card" style="margin-bottom:16px">
      <h2>${esc(info.name)}（1回${info.count}問）</h2>
      <p class="sub">登録されている問題：${inKind.length}問${inKind.length < info.count ? '（1回分に足りないので、ある分だけ出します）' : ''}</p>
      <div class="row">
        <button class="primary" id="start" ${inKind.length ? '' : 'disabled'}>始める</button>
        <button class="secondary" id="wrong" ${wrongCount ? '' : 'disabled'}>間違えた問題だけ（${wrongCount}問）</button>
      </div>
    </div>
    <div class="bento">
      ${fieldsOf(state.questions, kind).map((f) => statTile(f, fieldStat(stats, kind, f), `data-field="${esc(f)}"`)).join('')}
    </div>
    <h2>科目ごとの正答率</h2>
    <div class="bento">
      ${Object.entries(SUBJECTS).map(([k, s]) => statTile(s.name, stats.bySubject[k])).join('')}
    </div>
    ${state.flags.length ? `<div class="card">
      <h2>要確認の印をつけた解説</h2>
      <ul class="wrong-list">${state.flags.map((id) => `<li>${esc(flagLabel(id))}</li>`).join('')}</ul>
    </div>` : ''}`;
  app.querySelectorAll('[data-kind]').forEach((el) => {
    el.onclick = () => {
      state.kind = el.dataset.kind;
      saveKind();
      renderHome();
    };
  });
  app.querySelectorAll('[data-field]').forEach((el) => {
    el.onclick = () => startQuiz({ subject: kind, field: el.dataset.field });
  });
  document.getElementById('start').onclick = () => startQuiz({ subject: kind });
  document.getElementById('wrong').onclick = () => startQuiz({ subject: kind, wrongOnly: true });
}

function startQuiz(setup) {
  const queue = buildQueue(state.questions, setup, state.records, Math.random);
  if (queue.length === 0) return;
  beginQuiz(queue, setup.subject);
}

function beginQuiz(queue, subject) {
  state.queue = queue;
  state.subject = subject;
  state.index = 0;
  state.results = [];
  state.answered = false;
  state.inQuiz = true;
  location.hash = '#quiz';
  render();
}

function renderQuiz() {
  const q = state.queue[state.index];
  app.innerHTML = `${noticeBar()}<div class="qhead">
      <span class="sub">${esc(subjectName(q.subject))}・${state.index + 1} / ${state.queue.length}・${esc(q.field)}</span>
      <button class="secondary" id="quit">終わる</button>
    </div>
    ${storageNotice()}
    ${q.sure === false ? '<p class="notice" id="unsure">自信なし：この問題はAIの確信が低めです。公式の問題集や教科書で確かめてください。</p>' : ''}
    <div class="card" style="margin-bottom:16px"><p style="margin:0;white-space:pre-line">${esc(q.question)}</p></div>
    <div class="choices" style="grid-template-columns:1fr">${q.choices.map((c, i) =>
      `<button class="choice" style="text-align:left;padding:12px 16px;font-size:var(--fs-body);font-weight:500" data-choice="${i}">${i + 1}. ${esc(c)}</button>`).join('')}</div>
    <div id="after"></div>`;
  state.readyAt = performance.now() + TAP_GUARD_MS;
  document.getElementById('quit').onclick = showResult;
  app.querySelectorAll('.choice').forEach((el) => {
    el.onclick = () => answer(Number(el.dataset.choice));
  });
}

function explanationHtml(q) {
  const flagged = state.flags.includes(q.id);
  return `<div class="card explain">
      <p class="label">解説（AI作成・公式ではありません）</p>
      <p class="explain-text">${esc(q.explanation || 'この問題の解説はまだありません。')}</p>
      <button class="secondary" id="flag" aria-pressed="${flagged}">${flagged ? '要確認の印を外す' : '解説がおかしい？ 要確認の印をつける'}</button>
    </div>`;
}

function answer(choice) {
  if (state.answered || performance.now() < state.readyAt) return;
  state.answered = true;
  const q = state.queue[state.index];
  const correct = choice === q.answer;
  state.records = recordAnswer(state.records, q, choice);
  saveRecords();
  state.results.push({ q, correct });
  app.querySelectorAll('.choice').forEach((el) => {
    const n = Number(el.dataset.choice);
    el.disabled = true;
    if (n === q.answer) el.classList.add('correct');
    if (n === choice && !correct) el.classList.add('wrong');
  });
  const text = correct ? '正解' : `不正解（正解は ${q.answer + 1}. ${q.choices[q.answer]}）`;
  const last = state.index + 1 >= state.queue.length;
  document.getElementById('after').innerHTML = `<p class="feedback ${correct ? '' : 'ng'}" role="status">${esc(text)}</p>
    ${explanationHtml(q)}
    <button class="primary full" id="next">${last ? '結果を見る' : '次へ'}</button>`;
  const flag = document.getElementById('flag');
  flag.onclick = () => {
    state.flags = toggleFlag(state.flags, q.id);
    saveFlags();
    const on = state.flags.includes(q.id);
    flag.setAttribute('aria-pressed', String(on));
    flag.textContent = on ? '要確認の印を外す' : '解説がおかしい？ 要確認の印をつける';
  };
  document.getElementById('next').onclick = () => {
    if (last) { showResult(); return; }
    state.index += 1;
    state.answered = false;
    renderQuiz();
    window.scrollTo(0, 0);
  };
}

function showResult() {
  state.inQuiz = false;
  location.hash = '#result';
  render();
}

function renderResult() {
  const correct = state.results.filter((r) => r.correct).length;
  const total = state.results.length;
  const wrong = state.results.filter((r) => !r.correct);
  const rate = total ? Math.round((correct / total) * 100) : null;
  const pass = rate !== null && rate >= Math.round(CUTOFF * 100);
  const stats = subjectStats(state.records, state.questions);
  const pct = Math.round(CUTOFF * 100);
  app.innerHTML = `${noticeBar()}<div class="bento">
      <div class="card tile span-2"><div class="label">今回の正答率（${esc(subjectName(state.subject))}）</div><div class="value">${rate ?? '—'}<span class="unit">${rate === null ? '' : '%'}</span></div>
        <div class="state">${rate === null ? '' : pass ? `${pct}%以上：合格の目安をクリア` : `${pct}%未満：合格の目安まであと少し`}</div></div>
      <div class="card tile span-2"><div class="label">正解数</div><div class="value">${correct}<span class="unit"> / ${total}問</span></div></div>
    </div>
    <h2>科目ごとの正答率（これまでの合計）</h2>
    <div class="bento">${Object.entries(SUBJECTS).map(([k, s]) => statTile(s.name, stats.bySubject[k])).join('')}</div>
    <p class="sub">各科目${pct}%以上で合格の目安です。</p>
    <div class="card">
      <h2>間違えた問題</h2>
      ${wrong.length ? `<ul class="wrong-list">${wrong.map(({ q }) => `<li>${esc(q.field)}：${esc(q.question)}</li>`).join('')}</ul>` : '<p class="sub">ありません</p>'}
      <div class="row">
        <button class="primary" id="home">ホームへ</button>
        ${wrong.length ? '<button class="secondary" id="retry">間違えた問題を解き直す</button>' : ''}
      </div>
    </div>`;
  document.getElementById('home').onclick = () => { location.hash = '#home'; render(); };
  const retry = document.getElementById('retry');
  if (retry) retry.onclick = () => beginQuiz(wrong.map((r) => r.q), state.subject);
}

function render() {
  const wanted = location.hash.slice(1);
  const page = resolvePage(wanted, { inQuiz: state.inQuiz, hasResults: state.results.length > 0 });
  if (page !== state.current) window.scrollTo(0, 0);
  state.current = page;
  if (page !== 'quiz') state.inQuiz = false;
  if (page !== wanted) history.replaceState(null, '', `#${page}`);
  if (page === 'quiz') renderQuiz();
  else if (page === 'result') renderResult();
  else renderHome();
}

async function main() {
  loadRecords();
  try {
    state.questions = await loadQuestions();
    render();
  } catch (e) {
    renderError(e);
  }
}

window.addEventListener('hashchange', () => {
  if (location.hash.slice(1) !== state.current) render();
});

main();
