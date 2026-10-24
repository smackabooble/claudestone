// gearpress.sc - Carpet (scarpet) app: presses the START button of the diamond gear set several times, with a gap between the presses.
// Install: Fabric + fabric-carpet. Put this file in  <world>/scripts/gearpress.sc
// In game:   /script load gearpress
//            /gearpress start <x y z of the stone button> <presses> <gap in ticks>
//            e.g. /gearpress start 35 38 11 5 1000     (5 presses, 1000 ticks = 50 s apart; the sim needs about 46 s per set, so do not go below ~950)
//            /gearpress stop
// The first press is at once. It sets the button to powered=true, updates the block it sits on, and releases it 10 ticks later (like a real stone button).
// NOT tested in the real game (written from the scarpet docs): if the machine does not react, use  /player <name> use  on the button with a Carpet fake player instead.

__config() -> {
  'scope' -> 'global',
  'commands' -> {
    'start <pos> <presses> <gap>' -> 'start',
    'stop' -> 'stop'
  },
  'arguments' -> {
    'pos' -> {'type' -> 'pos'},
    'presses' -> {'type' -> 'int', 'min' -> 1, 'max' -> 100},
    'gap' -> {'type' -> 'int', 'min' -> 40, 'max' -> 20000}
  }
};

global_run = 0;
// (scarpet needs a function to be defined above the place that names it, so release/press come before start)

release(pos) -> (
  if(block(pos) != 'stone_button', return());
  st = block_state(pos);
  put(st, 'powered', 'false');
  set_block(pos, block(pos), st);
  update(pos);
  update(pos + [0, -1, 0])
);

press(pos, presses, gap, run, n) -> (
  if(run != global_run, return());
  if(block(pos) != 'stone_button', print('gearpress: button is gone'); return());
  st = block_state(pos);
  put(st, 'powered', 'true');
  set_block(pos, block(pos), st);
  update(pos);
  update(pos + [0, -1, 0]);
  print('gearpress: press ' + n + ' of ' + presses);
  schedule(10, 'release', pos);
  if(n < presses, schedule(gap, 'press', pos, presses, gap, run, n + 1))
);

start(pos, presses, gap) -> (
  if(block(pos) != 'stone_button',
    print(player(), 'gearpress: no stone button at ' + pos);
    return()
  );
  global_run += 1;
  print(player(), 'gearpress: ' + presses + ' presses, ' + gap + ' ticks apart');
  press(pos, presses, gap, global_run, 1)
);

stop() -> (
  global_run += 1;
  print(player(), 'gearpress: stopped')
);
