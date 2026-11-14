#!/usr/bin/env bash
# Sets up a local Fabric + Carpet Minecraft server (void world) in $MC_DIR (default /home/user/mcserver). Safe to re-run.
# The user accepted the Minecraft EULA (https://aka.ms/MinecraftEULA) in chat on 2026-11-14 -> eula=true.
set -euo pipefail
MC_VERSION="${MC_VERSION:-26.3}"
MC_DIR="${MC_DIR:-/home/user/mcserver}"
JDK_DIR="${JDK_DIR:-/home/user/jdk25}"
if ! ls "$JDK_DIR"/*/bin/java >/dev/null 2>&1; then   # Minecraft 26.x needs Java 25
  mkdir -p "$JDK_DIR" && curl -sS -L -m 300 -o "$JDK_DIR/jdk.tar.gz" "https://api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jre/hotspot/normal/eclipse" && tar xzf "$JDK_DIR/jdk.tar.gz" -C "$JDK_DIR"
fi
mkdir -p "$MC_DIR/mods" && cd "$MC_DIR"
LOADER=$(curl -sS -m 30 https://meta.fabricmc.net/v2/versions/loader | python3 -I -c "import sys,json;print([v['version'] for v in json.load(sys.stdin) if v['stable']][0])")
INSTALLER=$(curl -sS -m 30 https://meta.fabricmc.net/v2/versions/installer | python3 -I -c "import sys,json;print([v['version'] for v in json.load(sys.stdin) if v['stable']][0])")
[ -f fabric-server.jar ] || curl -sS -m 120 -L -o fabric-server.jar "https://meta.fabricmc.net/v2/versions/loader/$MC_VERSION/$LOADER/$INSTALLER/server/jar"
if ! ls mods/fabric-carpet*.jar >/dev/null 2>&1; then
  URL=$(curl -sS -m 30 "https://api.modrinth.com/v2/project/carpet/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%22$MC_VERSION%22%5D" | python3 -I -c "import sys,json;v=json.load(sys.stdin)[0];print(v['files'][0]['url'])")
  curl -sS -m 120 -L -o "mods/$(python3 -I -c "import sys,urllib.parse as u;print(u.unquote(sys.argv[1].rsplit('/',1)[1]))" "$URL")" "$URL"
fi
echo "eula=true" > eula.txt
cat > server.properties <<P
level-type=minecraft\:flat
generator-settings={"layers":[{"block":"minecraft:air","height":1}],"biome":"minecraft:the_void"}
gamemode=creative
force-gamemode=true
difficulty=peaceful
spawn-monsters=false
spawn-animals=false
spawn-npcs=false
spawn-protection=0
online-mode=false
view-distance=4
simulation-distance=4
enable-command-block=true
enable-rcon=true
rcon.port=25575
rcon.password=claudestone-local
server-ip=127.0.0.1
motd=claudestone redstone lab
max-players=2
pause-when-empty-seconds=-1
P
mkdir -p world/datapacks
echo "setup done: $MC_VERSION loader $LOADER installer $INSTALLER in $MC_DIR"; ls -la . mods
