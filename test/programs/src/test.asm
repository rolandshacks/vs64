
*=$0801
    !byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00

CLEAR = 147		; a global symbol definition
!addr	basout = $ffd2		; another one, marked as an address

start
    lda #$41                ; load char value
    pha
    pla
    ldx #$ff                ; load counter

loop
    sta $0400-1,X           ; poke to screen
    dex                     ; dec counter
    bne loop                ; loops

end
    rts                     ; exit

.string		!pet "Dumb example", 13, 0
