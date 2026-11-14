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
      lines += str('%d %d %d %s %s', _x, _y, _z, b, block_state(_))
    )
  );
  write_file(name, 'text', lines);
  length(lines)
);
