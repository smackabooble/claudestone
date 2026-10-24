// gearrec.sc - Carpet (scarpet) app: records everything that happens in a box, tick by tick, so a stuck item can be diagnosed. Also presses the START button.
// Install: Fabric + fabric-carpet. Put this file in  <world>/scripts/gearrec.sc
// In game:   /script load gearrec
//            /gearrec start <x1 y1 z1> <x2 y2 z2>      two opposite corners of the area to watch (keep it small, e.g. the top of one lift: about 8x10x8; ~ works)
//            /gearrec press <x y z of the button> <presses> <gap in ticks>      (optional, e.g. 1 press, or 5 presses 1000 ticks apart)
//            ...wait until the item is stuck...
//            /gearrec stop
// Output:    <world>/scripts/gearrec.data/rec.txt     (send me this file)
// Lines:  "T <tick>"                         start of a tick (ticks since /gearrec start)
//         "B x,y,z block{state}"             a block or its state changed (the first lines, before the first T, are the starting state)
//         "V x,y,z block [slot:itemxcount,..]"  the inventory of a hopper / dropper / chest / crafter changed
//         "I id x y z v vx vy vz item xcount age <ticks>"   every item entity in the box, every tick (position, motion)
//         "PRESS n" / "CLICK tick block x,y,z"   button presses by the script / your right-clicks
// Do NOT freeze the game. Fast version: only cells that can change (redstone parts, hoppers, droppers, chests, water...) are checked every tick, the whole box every 20 ticks;
// ticks where nothing happened are not written. Keep the box small anyway.

__config() -> {
  'scope' -> 'global',
  'commands' -> {
    'start <from> <to>' -> 'rec_start',
    'stop' -> 'rec_stop',
    'press <pos> <presses> <gap>' -> 'rec_press_cmd'
  },
  'arguments' -> {
    'from' -> {'type' -> 'pos'},
    'to' -> {'type' -> 'pos'},
    'pos' -> {'type' -> 'pos'},
    'presses' -> {'type' -> 'int', 'min' -> 1, 'max' -> 100},
    'gap' -> {'type' -> 'int', 'min' -> 40, 'max' -> 20000}
  }
};

global_on = false;
global_prev = {};
global_inv = {};
global_dyn = [];
global_buf = [];
global_lo = [0, 0, 0];
global_hi = [0, 0, 0];
global_c = [0, 0, 0];
global_d = [1, 1, 1];
global_t0 = 0;
global_run = 0;
global_dynamic_blocks = ['repeater', 'comparator', 'redstone_wire', 'redstone_torch', 'redstone_wall_torch', 'hopper', 'dropper', 'dispenser', 'crafter', 'chest', 'stone_button', 'observer', 'water', 'bubble_column', 'piston', 'sticky_piston', 'piston_head', 'moving_piston', 'lever'];

fnum(x) -> round(x * 1000) / 1000;

// one cell: compare with the last state and queue lines (lines are written once per tick, not one by one)
rec_cell(x, y, z, initial) -> (
  p = [x, y, z];
  k = str('%d,%d,%d', x, y, z);
  b = block(p);
  s = str(b) + str(block_state(p));
  if (global_prev:k != s, (
    put(global_prev, k, s);
    if (!initial || !(s ~ '^air'), global_buf += ('B ' + k + ' ' + s));
  ));
  n = inventory_size(p);
  if (n != null, (
    inv = [];
    for (range(n), (it = inventory_get(p, _); if (it != null, inv += (_ + ':' + it:0 + 'x' + it:1))));
    si = join(',', inv);
    if (global_inv:k != si, (
      put(global_inv, k, si);
      if (!initial || si != '', global_buf += ('V ' + k + ' ' + str(b) + ' [' + si + ']'));
    ));
  ));
);

// full scan of the box: finds the cells that can change (the "dynamic" ones) and records every static block once
rec_scan_all(initial) -> (
  dyn = [];
  volume(global_lo, global_hi, (
    rec_cell(_x, _y, _z, initial);
    if (global_dynamic_blocks ~ str(block([_x, _y, _z])) != null, dyn += [_x, _y, _z]);
  ));
  global_dyn = dyn;
);

rec_items() -> (
  for (entity_area('item', global_c, global_d), (
    m = _ ~ 'motion';
    it = _ ~ 'item';
    global_buf += ('I ' + (_ ~ 'id') + ' ' + fnum(_ ~ 'x') + ' ' + fnum(_ ~ 'y') + ' ' + fnum(_ ~ 'z') + ' v ' + fnum(m:0) + ' ' + fnum(m:1) + ' ' + fnum(m:2) + ' ' + it:0 + ' x' + it:1 + ' age ' + (_ ~ 'age'));
  ));
);

rec_start(a, b) -> (
  global_lo = [floor(min(a:0, b:0)), floor(min(a:1, b:1)), floor(min(a:2, b:2))];
  global_hi = [floor(max(a:0, b:0)), floor(max(a:1, b:1)), floor(max(a:2, b:2))];
  global_c = [(global_lo:0 + global_hi:0 + 1) / 2, (global_lo:1 + global_hi:1 + 1) / 2, (global_lo:2 + global_hi:2 + 1) / 2];
  global_d = [(global_hi:0 - global_lo:0 + 1) / 2 + 1, (global_hi:1 - global_lo:1 + 1) / 2 + 1, (global_hi:2 - global_lo:2 + 1) / 2 + 1];
  delete_file('rec', 'text');
  global_prev = {};
  global_inv = {};
  global_t0 = tick_time();
  global_buf = [];
  rec_scan_all(true);
  write_file('rec', 'text', global_buf);
  global_buf = [];
  global_on = true;
  print('gearrec: recording ' + global_lo + ' to ' + global_hi + ' - do your test, then /gearrec stop');
);

rec_stop() -> (
  global_on = false;
  global_run += 1;
  print('gearrec: stopped. File: scripts/gearrec.data/rec.txt in your world folder');
);

// ---- pressing the button (set(), not set_block(); functions are defined above the place that names them) ----
rec_release(pos) -> (
  if (block(pos) != 'stone_button', return());
  st = block_state(pos);
  put(st, 'powered', 'false');
  set(pos, block(pos), st);
  update(pos);
  update(pos + [0, -1, 0]);
);

rec_press(pos, presses, gap, run, n) -> (
  if (run != global_run, return());
  if (block(pos) != 'stone_button', print('gearrec: button is gone'); return());
  st = block_state(pos);
  put(st, 'powered', 'true');
  set(pos, block(pos), st);
  update(pos);
  update(pos + [0, -1, 0]);
  if (global_on, write_file('rec', 'text', 'PRESS ' + n));
  print('gearrec: press ' + n + ' of ' + presses);
  schedule(10, 'rec_release', pos);
  if (n < presses, schedule(gap, 'rec_press', pos, presses, gap, run, n + 1));
);

rec_press_cmd(pos, presses, gap) -> (
  if (block(pos) != 'stone_button', print(player(), 'gearrec: no stone button at ' + pos); return());
  global_run += 1;
  rec_press(pos, presses, gap, global_run, 1);
);

__on_tick() -> (
  if (global_on, (
    global_buf = [];
    t = tick_time() - global_t0;
    if (t % 20 == 0, rec_scan_all(false), for (global_dyn, rec_cell(_:0, _:1, _:2, false)));
    rec_items();
    if (length(global_buf) > 0, (lines = ['T ' + t]; for (global_buf, lines += _); write_file('rec', 'text', lines)));
  ));
);

__on_player_right_clicks_block(player, item_tuple, hand, block, face, hitvec) -> (
  if (global_on, write_file('rec', 'text', 'CLICK ' + (tick_time() - global_t0) + ' ' + block + ' ' + pos(block)));
);
