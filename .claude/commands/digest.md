---
description: Digest one or more JSONL session transcripts in order: reduce each in the shell, then summarize the full arc without reading the raw files into context.
argument-hint: <path.jsonl> [more.jsonl ...]
---

# Digest session transcript(s)

You are given one or more Claude Code session transcripts in JSONL, in the order they should be processed:

```
$ARGUMENTS
```

Produce a faithful digest of the **entire** arc across all of them. The whole point of this command is to see that arc cheaply, so the governing rule is non-negotiable:

> **Never read a raw .jsonl into context.** A long session is hundreds of thousands of tokens on disk, and almost all of that volume is tool-result payloads (file reads, command output, diffs, images) and thinking blocks. Do the reduction in the shell first, with a script that emits only the conversational and decision spine, and read *only* that projection. The cost is then proportional to the spine, not the files.

Treat the arguments as an **ordered list**: process and present them in the order given, oldest first. If a path is missing or not a `.jsonl`, report it and continue with the rest. If no valid file remains, say so and stop.

(Whitespace separates paths. If a path itself contains spaces, ask the user to rename or symlink it rather than guessing the split.)

## Step 1 — enumerate and inspect (do not read content yet)

Validate each file in order and confirm the JSON shape on the first one before projecting:

```bash
for f in $ARGUMENTS; do
  if [ ! -f "$f" ]; then echo "MISSING: $f"; continue; fi
  case "$f" in *.jsonl) ;; *) echo "NOT JSONL: $f"; continue;; esac
  echo "== $f =="
  echo "  bytes=$(wc -c < "$f")  lines=$(wc -l < "$f")  ~rawTok=$(( $(wc -c < "$f") / 4 ))"
done
echo "== shape check (first file) =="
first=$(for f in $ARGUMENTS; do [ -f "$f" ] && { echo "$f"; break; }; done)
jq -r '.type' "$first" 2>/dev/null | sort | uniq -c | sort -rn
```

If `jq` returns nothing, the file is not the expected Claude Code format; inspect a single record with `head -n1 "$first" | jq 'keys'` and adapt the projection below.

## Step 2 — project each file's spine into one ordered file

Keep: real user turns, assistant narration text, and tool-call names with truncated args. Drop: `tool_result` payloads and `thinking` blocks (the bulk). Concatenate the projections, in order, into a single combined spine file with a header per transcript, and report per-file and total reduction.

```bash
combined="/tmp/digest-spine-combined.txt"
: > "$combined"
total_raw=0; total_proj=0; i=0
for f in $ARGUMENTS; do
  { [ -f "$f" ] && case "$f" in *.jsonl) true;; *) false;; esac; } || continue
  i=$((i+1))
  tmp="/tmp/digest-spine-$(basename "$f" .jsonl).txt"
  jq -r '
    def trunc($n): if (.|length) > $n then (.[0:$n] + " …[+" + ((.|length)-$n|tostring) + " chars]") else . end;
    select(.type=="user" or .type=="assistant")
    | .message.content as $c
    | if (.type=="user") then
        ( if ($c|type)=="string" then "\n### USER\n" + ($c|trunc(4000))
          else ( [ $c[] | select(.type=="text") | .text ] | if length>0 then "\n### USER\n" + (join("\n")|trunc(4000)) else empty end )
          end )
      else
        ( [ $c[]
            | if .type=="text" then "\nASSISTANT: " + (.text|trunc(4000))
              elif .type=="tool_use" then "  >> " + .name + "(" + ((.input|tostring)|trunc(180)) + ")"
              else empty end
          ] | if length>0 then join("\n") else empty end )
      end
  ' "$f" > "$tmp"
  raw=$(wc -c < "$f"); proj=$(wc -c < "$tmp")
  total_raw=$((total_raw+raw)); total_proj=$((total_proj+proj))
  printf '\n\n===== TRANSCRIPT %d: %s (raw ~%dk tok -> spine ~%dk tok) =====\n' "$i" "$f" "$((raw/4000))" "$((proj/4000))" >> "$combined"
  cat "$tmp" >> "$combined"
  echo "transcript $i: $f -> raw $((raw/4)) tok, spine $((proj/4)) tok"
done
echo "TOTAL: raw $((total_raw/4)) tok, spine $((total_proj/4)) tok -> read only $combined"
```

Tuning knobs, if the combined spine is still large: lower the `trunc(4000)` on text and/or `trunc(180)` on tool input. If the reasoning trail matters for this digest, add a heavily-truncated `thinking` branch (e.g. `elif .type=="thinking" then "  (thinking) " + (.thinking|trunc(300))`). Default is to drop thinking entirely.

## Step 3 — read only the combined projection

`Read` `/tmp/digest-spine-combined.txt`, never the originals. It can span several read pages; the `===== TRANSCRIPT n =====` headers mark the boundaries. **Page through all of it** before writing anything. Do not summarize from a partial page, and do not stop at the first transcript when more follow.

## Step 4 — write the digest

Open with a **processing** note so the reduction is visible: per-file raw vs spine tokens and the combined total, with the reduction factor. State it plainly; if your byte-based estimate differs from what the read actually tokenized, say so.

Then decide the structure from what you read:

- **If the transcripts are one continuous arc** (same task threading across them, e.g. a session and its continuations, or a branch/PR carried forward): write **one unified digest** that flows in chronological order, noting where each transcript begins and what changed across the boundary.
- **If they are independent**: write a short digest per transcript in order, then a brief cross-cutting section for anything that connects them.

Either way, cover:

1. **What it was** — the starting ask and where it ended.
2. **The arc** — the substantive turns in order: what was asked, what was investigated or built, what was decided. Skip mechanical churn (repeated reads, typo fixes); keep the decisions and the turns that changed direction. Across multiple files, make the seams explicit (what carried over, what was revised, what was dropped).
3. **Key decisions and rationale** — what was chosen, why, and what was explicitly rejected.
4. **Where it landed** — final state, artifacts (branches, PRs, files, docs), open or deferred items.
5. **The throughline** — the meta-pattern across the whole arc: recurring tensions, course-corrections, user pushback. This is usually the most valuable part and the easiest to miss from a flat read.

Honesty over polish (house style): surface interruptions, reversals, claims left unproven, and work that was scaffolded but not verified. Do not smooth a messy arc into a tidy one. Follow the project writing style: tight, declarative, no em-dashes, no "not X but Y" reversals.
