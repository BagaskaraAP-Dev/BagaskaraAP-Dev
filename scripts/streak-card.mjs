// Draws quote-card.svg: a pixel-art card showing the current GitHub contribution streak.
// Everything, including the letters, is drawn as squares, because GitHub renders README
// SVGs as <img> and blocks external fonts.
//
//   GITHUB_TOKEN=... node scripts/streak-card.mjs
import { writeFileSync } from "node:fs";

const LOGIN = process.env.GH_LOGIN || "BagaskaraAP-Dev";
const TOKEN = process.env.GITHUB_TOKEN;
const QUOTE = "KEEP LEARNING AND KEEP TRYING";
const STRIP_DAYS = 60;
const OUT = new URL("../quote-card.svg", import.meta.url);

const C = {
  bg: "#1c1936",
  frame: "#2f2a58",
  text: "#efeaff",
  dim: "#a39cd0",
  moon: "#f7d774",
  crater: "#d6b356",
  empty: "#2f2a58",
};

// 5x7 bitmap font, rows top to bottom.
const FONT = {
  A: ".###. #...# #...# ##### #...# #...# #...#",
  B: "####. #...# #...# ####. #...# #...# ####.",
  C: ".###. #...# #.... #.... #.... #...# .###.",
  D: "####. #...# #...# #...# #...# #...# ####.",
  E: "##### #.... #.... ####. #.... #.... #####",
  F: "##### #.... #.... ####. #.... #.... #....",
  G: ".###. #...# #.... #.### #...# #...# .####",
  H: "#...# #...# #...# ##### #...# #...# #...#",
  I: ".###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
  J: "..### ...#. ...#. ...#. ...#. #..#. .##..",
  K: "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
  L: "#.... #.... #.... #.... #.... #.... #####",
  M: "#...# ##.## #.#.# #.#.# #...# #...# #...#",
  N: "#...# #...# ##..# #.#.# #..## #...# #...#",
  O: ".###. #...# #...# #...# #...# #...# .###.",
  P: "####. #...# #...# ####. #.... #.... #....",
  Q: ".###. #...# #...# #...# #.#.# #..#. .##.#",
  R: "####. #...# #...# ####. #.#.. #..#. #...#",
  S: ".#### #.... #.... .###. ....# ....# ####.",
  T: "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
  U: "#...# #...# #...# #...# #...# #...# .###.",
  V: "#...# #...# #...# #...# #...# .#.#. ..#..",
  W: "#...# #...# #...# #.#.# #.#.# #.#.# .#.#.",
  X: "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
  Y: "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
  Z: "##### ....# ...#. ..#.. .#... #.... #####",
  0: ".###. #...# #..## #.#.# ##..# #...# .###.",
  1: "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
  2: ".###. #...# ....# ...#. ..#.. .#... #####",
  3: "##### ...#. ..#.. ...#. ....# #...# .###.",
  4: "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
  5: "##### #.... ####. ....# ....# #...# .###.",
  6: "..##. .#... #.... ####. #...# #...# .###.",
  7: "##### ....# ...#. ..#.. .#... .#... .#...",
  8: ".###. #...# #...# .###. #...# #...# .###.",
  9: ".###. #...# #...# .#### ....# ...#. .##..",
  ":": "..... .##.. .##.. ..... .##.. .##.. .....",
  ".": "..... ..... ..... ..... ..... .##.. .##..",
  "-": "..... ..... ..... .###. ..... ..... .....",
};
const GLYPH_W = 5;
const GLYPH_H = 7;
const SPACE_W = 3;

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

// Returns [{date, count}] for every day since the account was created, oldest first.
async function fetchDays() {
  const { user } = await gql("query($login:String!){user(login:$login){createdAt}}", { login: LOGIN });
  const counts = new Map();
  const now = new Date();
  // contributionsCollection accepts at most one year per query.
  for (let from = new Date(user.createdAt); from < now; ) {
    const to = new Date(Math.min(from.getTime() + 364 * 86400e3, now.getTime()));
    const data = await gql(
      `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){
        contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`,
      { login: LOGIN, from: from.toISOString(), to: to.toISOString() },
    );
    for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
      for (const { date, contributionCount } of week.contributionDays) {
        counts.set(date, Math.max(counts.get(date) ?? 0, contributionCount));
      }
    }
    from = to;
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

function streaks(days) {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today without contributions yet doesn't break the streak until the day is over.
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  let current = 0;
  while (i >= 0 && days[i].count > 0) {
    current++;
    i--;
  }
  return { current, longest };
}

const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

function textWidth(str, px) {
  let w = 0;
  for (const ch of str) w += (ch === " " ? SPACE_W : GLYPH_W + 1) * px;
  return w - px;
}

// Pixel text as one path; runs of lit cells in a row are merged into a single rect.
function pixelText(str, x, y, px) {
  let d = "";
  let cx = x;
  for (const ch of str) {
    if (ch === " ") {
      cx += SPACE_W * px;
      continue;
    }
    const rows = FONT[ch].split(" ");
    rows.forEach((row, r) => {
      for (let c = 0; c < GLYPH_W; c++) {
        if (row[c] !== "#") continue;
        let n = 1;
        while (row[c + n] === "#") n++;
        d += rect(cx + c * px, y + r * px, n * px, px);
        c += n - 1;
      }
    });
    cx += (GLYPH_W + 1) * px;
  }
  return d;
}

// Crescent moon with a cratered crust, on a grid of `cells` x `cells`.
function moon(x, y, cells, px) {
  const r = cells / 2;
  const lit = [];
  const crater = [];
  // [col, row, width, height] in cells
  const craters = [
    [3, 10, 3, 2],
    [4, 6, 2, 1],
    [7, 16, 2, 2],
    [12, 19, 2, 1],
  ];
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const cx = col + 0.5;
      const cy = row + 0.5;
      const inDisc = (cx - r) ** 2 + (cy - r) ** 2 <= r * r;
      const inShadow = (cx - r - 6.5) ** 2 + (cy - r + 3.5) ** 2 <= (r - 1.5) ** 2;
      if (!inDisc || inShadow) continue;
      const cell = rect(x + col * px, y + row * px, px, px);
      if (craters.some(([kc, kr, kw, kh]) => col >= kc && col < kc + kw && row >= kr && row < kr + kh)) crater.push(cell);
      else lit.push(cell);
    }
  }
  return { lit: lit.join(""), crater: crater.join("") };
}

function star(x, y, px, big) {
  if (!big) return rect(x, y, px, px);
  return rect(x + px, y, px, px * 3) + rect(x, y + px, px * 3, px);
}

// Rounded corners the pixel way: the frame steps in one cell at each corner.
function steppedFrame(w, h, s) {
  return `M${s} 0h${w - 2 * s}v${s}h${s}v${h - 2 * s}h${-s}v${s}h${-(w - 2 * s)}v${-s}h${-s}v${-(h - 2 * s)}h${s}z`;
}

function render(days, { current, longest }) {
  // 36px padding on each side leaves exactly 657px: 60 day cells of 8px with 3px gaps.
  const W = 729;
  const H = 300;
  const P = 36;

  const moonPx = 6;
  const moonCells = 22;
  const m = moon(P, P, moonCells, moonPx);

  const numPx = 11;
  const numX = P + moonCells * moonPx + 40;
  const numY = P + 4;
  const num = String(current);
  const numW = textWidth(num, numPx);
  const unitPx = 5;
  const unitY = numY + GLYPH_H * numPx - GLYPH_H * unitPx;

  const labelPx = 3;
  const labelY = numY + GLYPH_H * numPx + 16;
  const subY = labelY + GLYPH_H * labelPx + 10;

  const cell = 8;
  const gap = 3;
  const stripY = subY + GLYPH_H * labelPx + 26;
  const strip = days.slice(-STRIP_DAYS);
  const stripX = W - P - (strip.length * (cell + gap) - gap);
  let stripLit = "";
  let stripEmpty = "";
  strip.forEach((d, i) => {
    const r = rect(stripX + i * (cell + gap), stripY, cell, cell);
    if (d.count > 0) stripLit += r;
    else stripEmpty += r;
  });

  const quotePx = 3;
  const quoteY = stripY + cell + 26;

  const stars = [
    [P + 150, P - 6, true, "a"],
    [P + 128, P + 70, false, ""],
    [P + 4, P + 140, false, "b"],
    [W - P - 60, P + 2, true, "c"],
    [W - P - 150, P + 60, false, ""],
    [W - P - 18, P + 96, false, "a"],
  ];
  const starSvg = stars
    .map(([x, y, big, tw]) => `<path class="star ${tw}" d="${star(x, y, 4, big)}"/>`)
    .join("");

  const title = `Streak kontribusi GitHub ${LOGIN}: ${current} hari, terpanjang ${longest} hari`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t" shape-rendering="crispEdges">
<title id="t">${title}</title>
<style>
.star{fill:${C.text};opacity:.55}
.a{animation:tw 3.2s steps(1) infinite}
.b{animation:tw 4.1s steps(1) infinite 1.3s}
.c{animation:tw 2.7s steps(1) infinite .6s}
@keyframes tw{0%,100%{opacity:.55}50%{opacity:.12}}
@media (prefers-reduced-motion:reduce){.star{animation:none}}
</style>
<path fill="${C.frame}" d="${steppedFrame(W, H, 6)}"/>
<path fill="${C.bg}" transform="translate(6 6)" d="${steppedFrame(W - 12, H - 12, 6)}"/>
${starSvg}
<path fill="${C.moon}" d="${m.lit}"/>
<path fill="${C.crater}" d="${m.crater}"/>
<path fill="${C.moon}" d="${pixelText(num, numX, numY, numPx)}"/>
<path fill="${C.text}" d="${pixelText("HARI", numX + numW + 22, unitY, unitPx)}"/>
<path fill="${C.text}" d="${pixelText("STREAK KONTRIBUSI", numX, labelY, labelPx)}"/>
<path fill="${C.dim}" d="${pixelText(`TERPANJANG: ${longest} HARI`, numX, subY, labelPx)}"/>
<path fill="${C.empty}" d="${stripEmpty}"/>
<path fill="${C.moon}" d="${stripLit}"/>
<path fill="${C.dim}" d="${pixelText(QUOTE, P, quoteY, quotePx)}"/>
</svg>
`;
}

if (!TOKEN) {
  console.error("GITHUB_TOKEN is not set");
  process.exit(1);
}
const days = await fetchDays();
const s = streaks(days);
writeFileSync(OUT, render(days, s));
console.log(`streak ${s.current} hari, terpanjang ${s.longest} hari, ${days.length} hari data`);
