#!/bin/sh
# Generates ../<name>.svg from <name>.txt.
# Line 1: palette "c=#hex ...". Then N rows of N chars ('.' = transparent).
# Short rows are padded and long ones cut to the first row's width (with a warning).
cd "$(dirname "$0")"
for f in *.txt; do
  n=${f%.txt}
  awk -v name="$n" '
    NR==1 { for (i=1;i<=NF;i++){ split($i,p,"="); pal[p[1]]=p[2] } ; next }
    { sub(/\r$/, ""); if (NR==2) W=length($0)
      r=$0; if (length(r)!=W) printf "WARN %s row %d len %d (want %d)\n", name, NR-2, length(r), W > "/dev/stderr"
      while (length(r)<W) r=r "."; rows[n++]=substr(r,1,W) }
    END {
      S = (W>n)?W:n
      printf "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 %d %d\" shape-rendering=\"crispEdges\">", S, S
      oy = S-n
      for (y=0;y<n;y++) { r=rows[y]; x=0
        while (x<W) { c=substr(r,x+1,1); w=1
          while (x+w<W && substr(r,x+w+1,1)==c) w++
          if (c!=".") { if (!(c in pal)) printf "WARN %s unknown %s\n", name, c > "/dev/stderr"
            printf "<rect x=\"%d\" y=\"%d\" width=\"%d\" height=\"1\" fill=\"%s\"/>", x, y+oy, w, pal[c] }
          x+=w } }
      print "</svg>" }' "$f" > "../$n.svg"
done
