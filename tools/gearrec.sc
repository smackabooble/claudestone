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
// Do NOT freeze the game, let it run normally. The box is scanned every tick: a huge box will lag.

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
global_lo = [0, 0, 0];
global_hi = [0, 0, 0];
global_c = [0, 0, 0];
global_d = [1, 1, 1];
global_t0 = 0;
global_run = 0;

fnum(x) -> round(x * 1000) / 1000;

rec_line(s) -> write_file('rec', 'text', s);

rec_scan(initial) -> (
  volume(global_lo, global_hi, (
    p = [_x, _y, _z];
    k = str('%d,%d,%d', _x, _y, _z);
    b = block(p);
    s = str(b) + str(block_state(p));
    if (global_prev:k != s, (
      put(global_prev, k, s);
      if (!initial || !(s ~ '^air'), rec_line('B ' + k + ' ' + s));
    ));
    n = inventory_size(p);
    if (n != null, (
      inv = [];
      for (range(n), (it = inventory_get(p, _); if (it != null, inv += (_ + ':' + it:0 + 'x' + it:1))));
      si = join(',', inv);
      if (global_inv:k != si, (
        put(global_inv, k, si);
        if (!initial || si != '', rec_line('V ' + k + ' ' + str(b) + ' [' + si + ']'));
      ));
    ));
  ));
);

rec_items() -> (
  for (entity_area('item', global_c, global_d), (
    m = _ ~ 'motion';
    it = _ ~ 'item';
    rec_line('I ' + (_ ~ 'id') + ' ' + fnum(_ ~ 'x') + ' ' + fnum(_ ~ 'y') + ' ' + fnum(_ ~ 'z') + ' v ' + fnum(m:0) + ' ' + fnum(m:1) + ' ' + fnum(m:2) + ' ' + it:0 + ' x' + it:1 + ' age ' + (_ ~ 'age'));
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
  rec_scan(true);
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
  if (global_on, rec_line('PRESS ' + n));
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
    rec_line('T ' + (tick_time() - global_t0));
    rec_scan(false);
    rec_items();
  ));
);

__on_player_right_clicks_block(player, item_tuple, hand, block, face, hitvec) -> (
  if (global_on, rec_line('CLICK ' + (tick_time() - global_t0) + ' ' + block + ' ' + pos(block)));
);
