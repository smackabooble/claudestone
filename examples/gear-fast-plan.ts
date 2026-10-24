/**
 * Delay planner for the compact gear set. The machine is built with nominal delays, START is simulated without items and the pulse times at
 * every pin are measured (`Meas`). A pre-delay or a PC gap shifts everything behind it by exactly the same time, so from one measurement the
 * delays can be moved so that every timeline fires when its items are there (the arrival times come from the hop counts of the conveyors:
 * a hopper hop is 8 gt). The caller repeats build -> measure -> plan until nothing changes.
 * All times are game ticks (gt) after the button press.
 */
export interface SpecInfo { name: string; d: number; s: number; parent: string; parallelS: boolean; noCrafter: boolean; pre: number; gap: number }
export type Adj = Record<string, { pre: number; gap: number }>;
/** label -> times of the rising edges at the pin (labels: start_tDM, start_tC2, ev_<timeline>, <timeline>.tl.PD / .PS / .PCa) */
export type Meas = Record<string, number[]>;

const SL = 20;       // slot: pulses are 20 gt apart
const HOP = 8;       // one hopper hop
const ARRIVE = 16;   // chest -> tap -> dropper loading after an item reached a stash (and block release -> tap)

export function plan(specs: SpecInfo[], adj: Adj, meas: Meas, hops: Record<string, number>): Adj {
  const sp = (n: string) => specs.find((s) => s.name === n)!;
  const m = (l: string) => meas[l] ?? [];
  const h = (n: string) => hops[n] ?? 0;
  const startM = (x: string) => (x === 'tDM' ? m('start_tDM')[0] : x === 'tC2' ? m('start_tC2')[0] : m('ev_' + x)[0]);
  const pdM = (x: string) => m(x + '.tl.PD'), psM = (x: string) => m(x + '.tl.PS'), pcaM = (x: string) => m(x + '.tl.PCa')[0];
  const A: Record<string, { pd: number[]; ps: number[]; pca?: number }> = {};
  const shiftKid: Record<string, number> = {};
  const out: Adj = {};
  const last = (a: number[]) => a[a.length - 1];

  /** one timeline: move its first pulse to dFirst (pre-delay), optionally its PC to dPC(adjusted events) (gap) */
  const proc = (x: string, dFirst?: number, dPC?: (a: typeof A[string]) => number | undefined) => {
    const s = sp(x);
    const parentShift = s.parent === 'START' ? 0 : (shiftKid[s.parent] ?? 0);
    const firstM = pdM(x)[0] ?? psM(x)[0];
    if (firstM === undefined) { console.log('plan: no pulses measured for', x); out[x] = { pre: s.pre, gap: s.gap }; shiftKid[x] = parentShift; A[x] = { pd: [], ps: [] }; return; }
    let preNew = s.pre;
    if (s.parent !== 'START' && dFirst !== undefined) preNew = Math.max(0, s.pre + Math.round((dFirst - (firstM + parentShift)) / 2));
    if (preNew === 1) preNew = 2;                       // a pre-delay snake needs at least 2 repeaters
    const own = parentShift + 2 * (preNew - s.pre);
    const a = { pd: pdM(x).map((t) => t + own), ps: psM(x).map((t) => t + own), pca: pcaM(x) !== undefined ? pcaM(x) + own : undefined };
    let gapNew = s.gap;
    if (dPC && a.pca !== undefined) { const want = dPC(a); if (want !== undefined) gapNew = Math.max(0, s.gap + Math.round((want - a.pca) / SL)); }
    const dg = SL * (gapNew - s.gap);
    if (a.pca !== undefined) a.pca += dg;
    A[x] = a; shiftKid[x] = own + dg; out[x] = { pre: preNew, gap: gapNew };
  };

  // ---- blocks: tDM releases two blocks per port; their arrival times decide when the block crafter timelines may start ----
  const tdm = { pd: pdM('tDM'), ps: psM('tDM') };
  const arr = {
    D: tdm.pd[0] + HOP * h('cvb0') + ARRIVE, A: tdm.pd[1] + HOP * (h('cvb0') + h('cvb1')) + ARRIVE,
    B: tdm.ps[0] + HOP * h('cvb2') + ARRIVE, C: tdm.ps[1] + HOP * (h('cvb2') + h('cvb3')) + ARRIVE,
  };
  const dFirstC1 = (k: 'D' | 'A' | 'B' | 'C') => arr[k] + 16;
  // tDM gap: its kid pins (tc1D, tc1B) should fire just early enough (pre >= 0)
  {
    const s = sp('tDM');
    const need = (k: 'D' | 'B') => { const x = 'tc1' + k; const first = pdM(x)[0]; const st = startM(x); if (first === undefined || st === undefined) return undefined; const delta0 = first - st - 2 * sp(x).pre; return dFirstC1(k) - delta0 - st; };
    const nd = [need('D'), need('B')].filter((v): v is number => v !== undefined);
    const dgap = nd.length ? Math.floor(Math.min(...nd) / SL) : 0;
    out.tDM = { pre: 0, gap: Math.max(0, s.gap + dgap) };
    A.tDM = { pd: tdm.pd, ps: tdm.ps }; shiftKid.tDM = SL * (out.tDM.gap - s.gap);
  }
  proc('tC2'); shiftKid.tC2 = 0;
  proc('tc1D', dFirstC1('D')); proc('tc1B', dFirstC1('B')); proc('tc1A', dFirstC1('A')); proc('tc1C', dFirstC1('C'));
  proc('tS0D', (A.tc1D.pca ?? 0) + 32);
  const planksPC = (cv: string) => (a: typeof A[string]) => last(a.pd) + HOP * h(cv) + 8 + 24;
  proc('tP_AB', (A.tC2.pca ?? 0) + 32, planksPC('cvpAB'));
  proc('tP_D', (A.tC2.pca ?? 0) + 32, planksPC('cvpD'));
  proc('tS0S', (A.tP_AB.pca ?? 0) + 32);
  // ---- units: diamonds ----
  const units: { name: string; pair: string }[] = [
    { name: 'diamond_pickaxe', pair: 'D' }, { name: 'diamond_axe', pair: 'D' }, { name: 'diamond_shovel', pair: 'A' }, { name: 'diamond_chestplate', pair: 'A' },
    { name: 'diamond_sword', pair: 'B' }, { name: 'diamond_leggings', pair: 'B' }, { name: 'diamond_boots', pair: 'C' }, { name: 'diamond_helmet', pair: 'C' },
  ];
  for (const u of units) {
    const first = u.pair === 'D' ? last(A.tS0D.pd) + HOP * h('cvS0Dy') + 8 + 28 : (A['tc1' + u.pair].pca ?? 0) + 40;
    proc('t_' + u.name, first);
  }
  const diamLast = (name: string) => last(A['t_' + name].pd) + HOP * h('cv' + name) + 8;
  // ---- sticks: after the diamonds of the tool they serve, and not before they exist ----
  const stickNet: Record<string, string> = { diamond_shovel: 'cvsShovel', diamond_sword: 'cvsSword', diamond_pickaxe: 'cvsPick', diamond_axe: 'cvsAxe' };
  const firstStick = (tools: string[], ready: number) => Math.max(ready, ...tools.map((t) => diamLast(t) + 16 - HOP * h(stickNet[t])));
  proc('tSD', firstStick(['diamond_pickaxe', 'diamond_axe'], (A.tP_D.pca ?? 0) + 32));
  proc('tSAB', firstStick(['diamond_shovel', 'diamond_sword'], last(A.tS0S.pd) + HOP * h('cvS0Sy') + 8 + 32));
  // ---- unit PC: when the last diamond and the last stick are in the crafter ----
  const stickLane: Record<string, () => number> = {
    diamond_pickaxe: () => last(A.tSD.pd), diamond_axe: () => last(A.tSD.ps), diamond_shovel: () => last(A.tSAB.pd), diamond_sword: () => last(A.tSAB.ps),
  };
  for (const u of units) {
    const x = 't_' + u.name;
    const s = sp(x); const a = A[x]; if (a.pca === undefined) continue;
    const dl = diamLast(u.name);
    const st = stickLane[u.name] ? stickLane[u.name]() + HOP * h(stickNet[u.name]) + 8 : 0;
    const want = Math.max(dl, st) + 32;
    const gapNew = Math.max(0, s.gap + Math.round((want - a.pca) / SL));
    out[x].gap = gapNew;
  }
  return out;
}
