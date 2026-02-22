B=53280 : P=53281 : V=53265 : T=646 : R=128
#lineskip 2
PRINT "{clear}"
30 C=C+1
IF C>15 THEN C=0
#linestep 5
FOR W=1 to 15:WAIT V,R:NEXT W
POKE B,C : POKE P, PEEK (B)
#linestep 100
POKE T, C
PRINT "XXX"
GOTO 30
