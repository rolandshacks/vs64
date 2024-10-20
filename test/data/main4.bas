10 n$ = ""
15 if n$ = "" then get# 1,n$
20 if n$ = "" then goto 40
30 print "this should not be reached"
40 if n$ = "" then n$ = "hello"
50 print n$
