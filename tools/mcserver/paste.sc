// paste.sc - Carpet app: paste blocks + container items from a text file WITHOUT any block updates (Carpet `without_updates`), so a snapshot of a running machine is reproduced EXACTLY,
// including unpowered extended pistons (which a normal setblock retracts at once). File: world/scripts/paste.data/<name>.txt, lines:  "x y z blockname k=v,k=v"  and  "V x y z slot item count"
// /pasteraw <name>
__config() -> {
  'scope' -> 'global',
  'commands' -> {'<name>' -> 'do_paste'},
  'arguments' -> {'name' -> {'type' -> 'term'}}
};
do_paste(name) -> (
  lines = read_file(name, 'text');
  n = 0;
  without_updates(
    for(lines,
      parts = split(' ', _);
      if(length(parts) >= 4,
        if(parts:0 == 'V',
          inventory_set([number(parts:1), number(parts:2), number(parts:3)], number(parts:4), number(parts:6), parts:5),
          st = {};
          if(length(parts) > 4, for(split(',', parts:4), kv = split('=', _); st:(kv:0) = kv:1));
          set([number(parts:0), number(parts:1), number(parts:2)], parts:3, st);
          n += 1
        )
      )
    )
  );
  n
);
