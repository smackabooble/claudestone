/** Crafting recipes for the crafter block (a small, explicit subset of vanilla). */
export interface Stack { id: string; count: number }
type Recipe =
  | { kind: 'shaped'; rows: string[]; keys: Record<string, string>; out: Stack }
  | { kind: 'shapeless'; ing: string[]; out: Stack };

const MATERIAL: Record<string, string> = { diamond: 'diamond', iron: 'iron_ingot', golden: 'gold_ingot', stone: 'cobblestone', wooden: 'oak_planks' };

const RECIPES: Recipe[] = [];
const shaped = (rows: string[], keys: Record<string, string>, id: string, count = 1) => RECIPES.push({ kind: 'shaped', rows, keys, out: { id, count } });
const shapeless = (ing: string[], id: string, count = 1) => RECIPES.push({ kind: 'shapeless', ing, out: { id, count } });

for (const [name, mat] of Object.entries(MATERIAL)) {
  const k = { X: mat, S: 'stick' };
  shaped(['X', 'X', 'S'], k, `${name}_sword`);
  shaped(['XXX', '.S.', '.S.'], k, `${name}_pickaxe`);
  shaped(['XX', 'XS', '.S'], k, `${name}_axe`);
  shaped(['X', 'S', 'S'], k, `${name}_shovel`);
  shaped(['XX', '.S', '.S'], k, `${name}_hoe`);
  if (name !== 'stone' && name !== 'wooden') {
    shaped(['XXX', 'X.X'], { X: mat }, `${name}_helmet`);
    shaped(['X.X', 'XXX', 'XXX'], { X: mat }, `${name}_chestplate`);
    shaped(['XXX', 'X.X', 'X.X'], { X: mat }, `${name}_leggings`);
    shaped(['X.X', 'X.X'], { X: mat }, `${name}_boots`);
  }
}
shapeless(['oak_log'], 'oak_planks', 4);
shaped(['P', 'P'], { P: 'oak_planks' }, 'stick', 4);
shapeless(['diamond_block'], 'diamond', 9);
shaped(['DDD', 'DDD', 'DDD'], { D: 'diamond' }, 'diamond_block');
shapeless(['iron_block'], 'iron_ingot', 9);
shaped(['III', 'III', 'III'], { I: 'iron_ingot' }, 'iron_block');
shaped(['PP', 'PP'], { P: 'oak_planks' }, 'crafting_table');
shaped(['PPP', 'P.P', 'PPP'], { P: 'oak_planks' }, 'chest');

const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(''));

/** grid: 9 entries, row-major (slot 0 = top left); null/undefined = empty or disabled slot */
export function craft(grid: (string | null | undefined)[]): Stack | null {
  const items = grid.filter((x): x is string => !!x);
  if (!items.length) return null;
  for (const r of RECIPES) {
    if (r.kind === 'shapeless') {
      if (items.length !== r.ing.length) continue;
      const need = [...r.ing].sort().join(',');
      if ([...items].sort().join(',') === need) return { ...r.out };
      continue;
    }
    // bounding box of the occupied cells
    let r0 = 9, r1 = -1, c0 = 9, c1 = -1;
    grid.forEach((g, i) => { if (g) { const rr = Math.floor(i / 3), cc = i % 3; r0 = Math.min(r0, rr); r1 = Math.max(r1, rr); c0 = Math.min(c0, cc); c1 = Math.max(c1, cc); } });
    const h = r1 - r0 + 1, w = c1 - c0 + 1;
    for (const rows of [r.rows, mirror(r.rows)]) {
      if (rows.length !== h || rows[0].length !== w) continue;
      let ok = true;
      for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
        const want = rows[y][x] === '.' ? null : r.keys[rows[y][x]];
        const have = grid[(r0 + y) * 3 + c0 + x] || null;
        if (want !== have) ok = false;
      }
      if (ok) return { ...r.out };
    }
  }
  return null;
}
