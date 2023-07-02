;
; Hello, world!
;

*=$0801
!byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00
jmp main

!set txt = data                             ; reference to ascii text (to demonstrate resource compilation)
!set ofs = 20 - (data_end - data) / 2       ; center text

main
    ldy #0

write
    lda txt,y
    and #%00111111
    beq +
    sta $400+ofs,y
    lda #1
    sta $d800+ofs,y
    iny
    jmp write
+
    rts

!src "src/include.asm"
