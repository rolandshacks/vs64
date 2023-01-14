;
; Test file 2
;

func            ; write 'B' to screen column 2
    pha
    lda #$2
    sta $0401
    pla
    rts
