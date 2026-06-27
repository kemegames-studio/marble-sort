const C = {
  red: "red", blue: "blue", green: "green", yellow: "yellow",
  purple: "purple", pink: "pink", orange: "orange", cyan: "cyan"
};

const handcrafted = [
  [[C.orange, C.blue, C.orange, C.blue], [C.blue, C.orange, C.blue, C.orange], []],
  [[C.blue, C.orange, C.red, C.blue], [C.orange, C.red, C.blue, C.orange], [C.red, C.blue, C.orange, C.red], [], []],
  [[C.blue, C.orange, C.red, C.orange], [C.blue, C.red, C.red, C.blue], [C.orange, C.blue, C.red, C.orange], [], []],
  [[C.red, C.green, C.orange, C.blue], [C.blue, C.orange, C.green, C.red], [C.green, C.red, C.blue, C.orange], [C.orange, C.blue, C.red, C.green], [], []],
  [[C.red, C.green, C.pink, C.blue], [C.blue, C.pink, C.red, C.green], [C.green, C.red, C.blue, C.pink], [C.pink, C.blue, C.green, C.red], [], []],
  [[C.red, C.blue, C.orange, C.green], [C.green, C.orange, C.blue, C.red], [C.blue, C.red, C.green, C.orange], [C.orange, C.green, C.red, C.blue], [], []],
  [[C.orange, C.red, C.orange, C.green], [C.blue, C.red, C.orange, C.blue], [C.pink, C.orange, C.blue, C.pink], [C.green, C.pink, C.red, C.blue], [C.green, C.red, C.pink, C.green], [], []],
  [[C.pink, C.red, C.blue, C.pink], [C.red, C.green, C.orange, C.blue], [C.orange, C.pink, C.orange, C.red], [C.green, C.red, C.green, C.blue], [C.blue, C.orange, C.pink, C.green], [], []],
  [[C.pink, C.blue, C.red, C.pink], [C.red, C.green, C.orange, C.blue], [C.red, C.orange, C.orange, C.pink], [C.pink, C.red, C.green, C.blue], [C.green, C.orange, C.blue, C.green], [], []],
  [[C.pink, C.blue, C.green, C.blue], [C.orange, C.red, C.pink, C.red], [C.blue, C.cyan, C.green, C.green], [C.pink, C.orange, C.green, C.red], [C.red, C.blue, C.cyan, C.orange], [C.cyan, C.pink, C.orange, C.cyan], [], []]
];

function seeded(level) {
  let value = level * 2654435761;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value)) >>> 0) / 4294967296;
}

function generated(level) {
  const colorCount = Math.min(8, 3 + Math.floor(level / 12));
  const colors = Object.values(C).slice(0, colorCount);
  const marbles = colors.flatMap(color => Array(4).fill(color));
  const random = seeded(level);
  for (let i = marbles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [marbles[i], marbles[j]] = [marbles[j], marbles[i]];
  }
  const tubes = Array.from({ length: colorCount }, (_, i) => marbles.slice(i * 4, i * 4 + 4));
  tubes.push([], []);
  return tubes;
}

export const LEVELS = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  tubes: structuredClone(handcrafted[i] || generated(i + 1))
}));

export { C };
