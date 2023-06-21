//
// Example
//

*=$0801
.byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00
jmp main

hellotext:
    .encoding "screencode_mixed"
    .text "hello, world!"
    .byte $0
    .const ofs = 14

main:
    ldy #0

hello:
    lda hellotext,y
    beq !loop+
    sta $400+ofs,y
    lda #1
    sta $d800+ofs,y
    iny
    jmp hello
!loop:
    rts
