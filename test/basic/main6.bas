print"{clr}"
fory=0to24:forx=0to39
goto delay
poke1024+(y*40)+x,1
delay 11
delay:next:next
