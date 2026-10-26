#!/usr/bin/env bash
# Build app J2ME ra build/S60Tube.jar + build/S60Tube.jad.
# Can: JDK 11+ va Maven (chi de tai cong cu). Chay duoc tren Git Bash/Linux.
#
#   ./build.sh               dung dia chi may chu mac dinh trong Settings.java
#   VERSION=1.2.3 ./build.sh dat so phien ban (MIDlet-Version chi nhan so)
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${VERSION:-1.0.0}"
OUT=build
LIB=$OUT/lib
SEP=":"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) SEP=";" ;; esac

rm -rf "$OUT/classes" "$OUT/res" "$OUT"/*.jar "$OUT"/*.jad
mkdir -p "$OUT/classes" "$OUT/res"

# 1. Cong cu: trinh bien dich ECJ, ProGuard, API cua may.
if [ ! -f "$LIB/ecj-3.26.0.jar" ]; then
  mvn -q -f tools/pom.xml dependency:copy-dependencies -DoutputDirectory="../$LIB"
fi
API="$LIB/cldcapi11-2.0.4.jar${SEP}$LIB/midpapi20-2.0.4.jar${SEP}$LIB/microemu-jsr-135-2.0.4.jar"

# 2. Bien dich ra bytecode 1.1 (CLDC khong doc class doi moi hon).
java -jar "$LIB/ecj-3.26.0.jar" -source 1.3 -target 1.1 -encoding UTF-8 -nowarn \
  -bootclasspath "$API" -d "$OUT/classes" src

# 3. Bieu tuong.
java tools/Icon.java "$OUT/res/icon.png" 64

# 4. Manifest va dong goi (chua kiem truoc).
cat > "$OUT/MANIFEST.MF" <<EOF
Manifest-Version: 1.0
MIDlet-Name: S60Tube
MIDlet-Vendor: s60youtube
MIDlet-Version: $VERSION
MIDlet-Icon: /icon.png
MIDlet-1: S60Tube, /icon.png, s60tube.S60Tube
MicroEdition-Configuration: CLDC-1.1
MicroEdition-Profile: MIDP-2.0
Nokia-MIDlet-Category: Application
Nokia-MIDlet-On-Screen-Keypad: no
Nokia-MIDlet-no-exit: true
EOF
jar cfm "$OUT/raw.jar" "$OUT/MANIFEST.MF" -C "$OUT/classes" . -C "$OUT/res" .

# 5. ProGuard: kiem truoc (-microedition them StackMap cho CLDC), bo phan thua.
java -cp "$LIB/*" proguard.ProGuard \
  -injars "$OUT/raw.jar" \
  -outjars "$OUT/S60Tube.jar" \
  -libraryjars "$API" \
  -microedition \
  -dontoptimize \
  -dontobfuscate \
  -dontnote \
  -keep 'public class * extends javax.microedition.midlet.MIDlet'
rm -f "$OUT/raw.jar"

# 6. File .jad — may Nokia doc kich thuoc jar tu day.
SIZE=$(wc -c < "$OUT/S60Tube.jar" | tr -d ' ')
{
  grep -v '^Manifest-Version' "$OUT/MANIFEST.MF"
  echo "MIDlet-Jar-URL: S60Tube.jar"
  echo "MIDlet-Jar-Size: $SIZE"
} > "$OUT/S60Tube.jad"

echo "Xong: $OUT/S60Tube.jar ($SIZE byte), $OUT/S60Tube.jad"
