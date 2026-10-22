// doortrace.sc - Carpet (scarpet) app: records every block change in a box, with the game tick.
// Install: Fabric + fabric-carpet for your Minecraft version. Put this file in  <world>/scripts/doortrace.sc
// In game:   /script load doortrace
//            /doortrace start <x1 y1 z1> <x2 y2 z2>     (two opposite corners of the door box, ~ works)
//            ...flip the lever, wait until the door stops...
//            /doortrace stop
// Output:    <world>/scripts/doortrace.data/trace.txt    (send me this file)
// Lines: "T <tick>" then "x,y,z <block>{state}" for every block whose block or state changed that tick.
// The first lines (before the first T) are the starting state. Do NOT freeze ticks, just let it run normally.

__config() -> {
  'scope' -> 'global',
  'commands' -> {
    'start <from> <to>' -> 'trace_start',
    'stop' -> 'trace_stop'
  },
  'arguments' -> {
    'from' -> {'type' -> 'pos'},
    'to' -> {'type' -> 'pos'}
  }
};

global_on = false;
global_prev = {};
global_lines = [];
global_lo = [0, 0, 0];
global_hi = [0, 0, 0];
global_t0 = 0;

trace_start(a, b) -> (
  global_lo = [floor(min(a:0, b:0)), floor(min(a:1, b:1)), floor(min(a:2, b:2))];
  global_hi = [floor(max(a:0, b:0)), floor(max(a:1, b:1)), floor(max(a:2, b:2))];
  delete_file('trace', 'text');
  global_prev = {};
  global_lines = [];
  global_t0 = tick_time();
  trace_scan(true);
  for(global_lines, write_file('trace', 'text', _));
  global_on = true;
  print('doortrace: recording ' + global_lo + ' to ' + global_hi + ' - now flip the lever, then /doortrace stop');
);

trace_stop() -> (
  global_on = false;
  print('doortrace: stopped. File: scripts/doortrace.data/trace.txt in your world folder');
);

trace_scan(initial) -> (
  volume(global_lo, global_hi, (
    p = [_x, _y, _z];
    k = str('%d,%d,%d', _x, _y, _z);
    s = str(block(p)) + str(block_state(p));
    if (global_prev:k != s, (
      put(global_prev, k, s);
      if (!initial || !(s ~ '^air'), global_lines += (k + ' ' + s));
    ));
  ));
);

__on_tick() -> (
  if (global_on, (
    global_lines = ['T ' + (tick_time() - global_t0)];
    trace_scan(false);
    if (length(global_lines) > 1, for(global_lines, write_file('trace', 'text', _)));
  ));
);
