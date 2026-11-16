// labsnap.sc - Carpet (scarpet) app: writes a snapshot of every non-air block in a box to a file, on demand (no per-tick recording, so no lag).
// Install: Fabric + fabric-carpet. Put this file in  <world>/scripts/labsnap.sc
// In game:   /script load labsnap
//            /labsnap <x1 y1 z1> <x2 y2 z2> <name>      two opposite corners of the box (the whole lab; ~ works), name e.g. before / on / off
// Output:    <world>/scripts/labsnap.data/<name>.txt     one line per block:  x,y,z block{prop: value, ...}
// The lab procedure (see examples/lab.ts):  /labsnap ... before  ->  flick the lever ON  ->  wait 10 s  ->  /labsnap ... on  ->
//            flick the lever OFF  ->  wait 10 s  ->  /labsnap ... off.   Then send me the three files and the lever's world coordinates.
// The command freezes nothing; it takes a few seconds for a big box (one big scan).

__config() -> {
  'scope' -> 'global',
  'commands' -> {
    '<from> <to> <name>' -> 'snap'
  },
  'arguments' -> {
    'from' -> {'type' -> 'pos'},
    'to' -> {'type' -> 'pos'},
    'name' -> {'type' -> 'term'}
  }
};

snap(a, b, name) -> (
  lo = [floor(min(a:0, b:0)), floor(min(a:1, b:1)), floor(min(a:2, b:2))];
  hi = [floor(max(a:0, b:0)), floor(max(a:1, b:1)), floor(max(a:2, b:2))];
  delete_file(name, 'text');
  lines = [];
  volume(lo, hi, (
    if (!air([_x, _y, _z]), (
      lines += (str('%d,%d,%d ', _x, _y, _z) + str(block([_x, _y, _z])) + str(block_state([_x, _y, _z])));
      if (length(lines) >= 2000, (write_file(name, 'text', lines); lines = []));
    ));
  ));
  if (length(lines) > 0, write_file(name, 'text', lines));
  print('labsnap: wrote ' + name + ' (box ' + lo + ' to ' + hi + ') to scripts/labsnap.data/' + name + '.txt');
);
