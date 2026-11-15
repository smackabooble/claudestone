// dump.sc - Carpet app: write every non-air block of a box (position, name, full state) to world/scripts/dump.data/<name>.txt
// /script load dump ; /dump <x1 y1 z1> <x2 y2 z2> <name>      (used by tools/mcserver/compare.ts through RCON)
__config() -> {
  'scope' -> 'global',
  'commands' -> {'<from> <to> <name>' -> 'do_dump'},
  'arguments' -> {'from' -> {'type' -> 'pos'}, 'to' -> {'type' -> 'pos'}, 'name' -> {'type' -> 'term'}}
};
do_dump(from, to, name) -> (
  delete_file(name, 'text');
  lines = [];
  volume(from, to,
    b = block(_);
    if(b != 'air' && b != 'cave_air' && b != 'void_air',
      lines += str('%d %d %d %s %s', _x, _y, _z, b, block_state(_));
      n = inventory_size(_);
      if(n != null && n > 0,
        for(range(n), it = inventory_get(_x, _y, _z, _); if(it != null, lines += str('V %d %d %d %d %s %d', _x, _y, _z, _, it:0, it:1)))
      )
    )
  );
  write_file(name, 'text', lines);
  length(lines)
);
