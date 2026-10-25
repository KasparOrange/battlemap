#!/bin/sh
# Paint the effect textures the downloads don't cover, with Gemini (Nano Banana 2.1) through the
# image engine (~/code/image-generation-engine, `ige`). One picture per line of a prompts file
# (name<TAB>prompt), four calls at a time, into an ige project so cost and lineage are kept.
#
# Usage: gemini_generate.sh PROMPTS.tsv PROJECT_DIR [NAME...]
#   NAME...  only these lines (re-roll a few); default all
# Then copy the chosen picture of each name to v2/assets-src/gemini/picked/<name>.png
# (`ige -p PROJECT show` lists them; the prompt is the node's prompt).
set -eu
prompts=$1 proj=$2
shift 2
GEMINI_API_KEY=$(cat "$HOME/.config/battlemap/gemini.key")
export GEMINI_API_KEY IGE_APP=battlemap-effects
ige=$HOME/code/image-generation-engine/bin/ige
want=" $* "
while IFS="$(printf '\t')" read -r name prompt; do
  [ -n "$name" ] || continue
  if [ "$want" != "  " ] && ! printf '%s' "$want" | grep -q " $name "; then continue; fi
  printf '%s|%s\n' "$name" "$prompt"
done < "$prompts" | xargs -P 4 -S 8192 -I{} sh -c '
  line="$1"; name=${line%%|*}; prompt=${line#*|}
  out=$("$0" -p "$2" --json generate --raw --size 1K --aspect 1:1 -n 1 "$prompt" 2>&1) || { echo "FAIL $name: $out" | head -c 400; echo; exit 0; }
  echo "$name $(printf "%s" "$out" | tr -d "\n" | head -c 160)"
' "$ige" {} "$proj"
