#
# BASIC Example
#
# This example demonstrates some extended
# features of the BASIC compiler.
#
# - Automatic line number generation
# - Labels
# - Control character mnemonics
#

GOTO Start
#include "include.bas"

# Start of program
Start:
    A$="{clr}HELLO, {green}WORLD{$21}{lightblue}"
    B%=0

# Program loop
Loop:
    POKE 53280,B%
    B%=B%+1
    IF B%>15 THEN B%=0
    PRINT A$
    GOSUB PrintLine
    GOSUB Delay
GOTO Loop
