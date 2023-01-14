;
; Test file
;

*=$0801
!byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00
jmp start

start           ; write 'A' to screen column 1
    pha
    lda #$1
    sta $0400
    pla
    rts
