;
; Assembler Code
;

.global testfunc

testfunc:
    pha
    lda #$aa
    pla
    rts
