#!/usr/bin/env bash
# start the real-Minecraft lab server in the background (Java 25 needed for 26.x; setup.sh downloads server+Carpet, see knowledge/REALMC.md)
MC_DIR="${MC_DIR:-/home/user/mcserver}"; JAVA="${JAVA:-$(ls /home/user/jdk25/*/bin/java | head -1)}"
cd "$MC_DIR" && (nohup "$JAVA" -Xmx2G -jar fabric-server.jar nogui > server.log 2>&1 &)
for i in $(seq 1 60); do grep -q 'RCON running' server.log 2>/dev/null && { echo "server up"; exit 0; }; sleep 1; done
echo "server did not start"; tail -20 server.log; exit 1
