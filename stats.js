export const SUBJECTS = {
  law: { name: '法令', count: 15 },
  physchem: { name: '物理・化学', count: 10 },
  fire: { name: '性質・消火', count: 20 },
};
export const CUTOFF = 0.6; // 各科目60%以上で合格の目安
export const NOTICE = 'AI作成の問題です。本番前は公式の問題集で確認を';

export const subjectName = (s) => SUBJECTS[s]?.name ?? '';

export function fieldsOf(questions, subject) {
  return [...new Set(questions.filter((q) => q.subject === subject).map((q) => q.field))];
}

// 解説に「要確認」の印をつけた問題の一覧
export function toggleFlag(flags, id) {
  return flags.includes(id) ? flags.filter((f) => f !== id) : [...flags, id].sort();
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 1回分の出題。問題が足りなければ、ある分だけ出す
export function buildQueue(questions, { subject, field = null, wrongOnly = false }, records, rng) {
  const picked = questions.filter((q) =>
    q.subject === subject &&
    (field === null || q.field === field) &&
    (!wrongOnly || records[q.id]?.last === false));
  return shuffled(picked, rng).slice(0, SUBJECTS[subject].count);
}

export function recordAnswer(records, question, choice) {
  const old = records[question.id] ?? { a: 0, c: 0 };
  const correct = choice === question.answer;
  return { ...records, [question.id]: { a: old.a + 1, c: old.c + (correct ? 1 : 0), last: correct } };
}

// 壊れた記録（形が違うもの）は捨てる
export function cleanRecords(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, r] of Object.entries(raw)) {
    if (r && Number.isInteger(r.a) && Number.isInteger(r.c) && r.a >= 0 && r.c >= 0 && r.c <= r.a) {
      out[id] = { a: r.a, c: r.c, last: r.last === true };
    }
  }
  return out;
}

const makeStat = () => ({ attempts: 0, correct: 0, rate: null, belowCutoff: false });
function finish(stat) {
  stat.rate = stat.attempts ? stat.correct / stat.attempts : null;
  stat.belowCutoff = stat.rate !== null && stat.rate < CUTOFF;
  return stat;
}

// 科目ごと・分野ごとの正答率
export function subjectStats(records, questions) {
  const bySubject = Object.fromEntries(Object.keys(SUBJECTS).map((s) => [s, makeStat()]));
  const byField = {};
  for (const q of questions) {
    const r = records[q.id];
    if (!r) continue;
    const key = `${q.subject}/${q.field}`;
    byField[key] ??= makeStat();
    for (const st of [bySubject[q.subject], byField[key]]) {
      if (!st) continue;
      st.attempts += r.a;
      st.correct += r.c;
    }
  }
  Object.values(bySubject).forEach(finish);
  Object.values(byField).forEach(finish);
  return { bySubject, byField };
}

export const fieldStat = (stats, subject, field) => stats.byField[`${subject}/${field}`] ?? finish(makeStat());
