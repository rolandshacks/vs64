10 REM *******************************
20 REM * BASIC EXAMPLE
30 REM *******************************
100 REM INITIALIZE VARIABLES
110 A = 123.45
120 B% = 45
130 C$ = "HELLO"
200 REM INITIALIZE ARRAYS
210 DIM I(2)
220 DIM J%(4)
230 DIM K$(5)
240 I(0) = A
250 I(1) = 4.5678
260 I(2) = 987.65
270 J%(3) = B%
280 K$(1) = "ABC"
290 K$(3) = C$
300 REM LOOP
310 POKE 53280,B%
320 B%=B%+1
330 IF B%>15 THEN B%=0
340 print K$(3)
350 GOTO 310
