// 今の状態で開ける画面を決める。戻るボタンで途中の画面に戻らないようにする
export function resolvePage(page, { inQuiz, hasResults }) {
  const resultOrHome = hasResults ? 'result' : 'home';
  if (inQuiz) return page === 'quiz' ? 'quiz' : resultOrHome;
  if (page === 'quiz' || page === 'result') return resultOrHome;
  return 'home';
}
