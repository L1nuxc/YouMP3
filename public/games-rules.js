export function slide2048(board, direction) {
  let moved = false,
    score = 0;
  const out = board.slice();
  for (let line = 0; line < 4; line++) {
    const ids = Array.from({ length: 4 }, (_, i) =>
      direction === 'left'
        ? line * 4 + i
        : direction === 'right'
          ? line * 4 + 3 - i
          : direction === 'up'
            ? i * 4 + line
            : (3 - i) * 4 + line,
    );
    const a = ids.map((i) => board[i]).filter(Boolean),
      b = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] === a[i + 1]) {
        const n = a[i] * 2;
        b.push(n);
        score += n;
        i++;
      } else b.push(a[i]);
    }
    while (b.length < 4) b.push(0);
    ids.forEach((id, i) => {
      out[id] = b[i];
      if (board[id] !== b[i]) moved = true;
    });
  }
  return { board: out, moved, score };
}
