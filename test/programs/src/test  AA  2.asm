
*=$0801
    !byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00

start
    lda #$43                ; load char value
    ldx #$ff                ; load counter
 
loop
    sta $0400-1,X           ; poke to screen
    dex                     ; dec counter
    bne loop                ; loop

end
    rts                     ; exit
