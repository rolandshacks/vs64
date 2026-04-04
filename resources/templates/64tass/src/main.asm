;
; Example - 64tass
;

        * = $0801

; BASIC SYS stub: 10 SYS 2064
basic_stub
        .word basic_end
        .word 10
        .byte $9E
        .text "2064"
        .byte $00
basic_end
        .word $0000

        * = $0810

main
        jsr show_message
        rts

show_message .proc
        ldx #$00
_loop   lda _text,x
        beq _done
        sta $0400 + 40 + 15,x
        lda #$01
        sta $D800 + 40 + 15,x
        inx
        bne _loop
_done   rts
_text   .text "hello, world!", 0
        .pend
