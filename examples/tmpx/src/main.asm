*=$801
.byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00

offset = 0
main
    ldy #0

hello
    lda hellotext, y
    beq done
    sta $400+offset, y
    lda #1
    sta $d800+offset, y
    iny
    jmp hello

done
    rts
    
.include "include.asm"