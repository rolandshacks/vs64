#
# Some helper functions
#

# Print line to screen
PrintLine:
    PRINT("--------------------")
    RETURN

# Delay execution
Delay:
    POKE162,0
    WAIT 162,10
    RETURN
