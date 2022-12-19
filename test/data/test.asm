; 
; C64 demo
;

*=$0801
!byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00
jmp start

!src "includes/helper.asm"

;ADDR_YSCRL          = $d011
ADDR_SCREEN         = $0400
ADDR_COLOR          = $d800 

.counter        !16 $0000   ; repeat counter
.char_counter   !08 $00     ; character output counter
.mask           !08 $00

start
    jsr setColors

    ; init counter to 1000
    lda #$2c
    sta .counter+0
    lda #$01
    sta .counter+1

    lda ADDR_YSCRL          ; backup scroll register
    sta .statebuffer+1

repeat
    lda #$ff                ; init character loop counter
    sta .char_counter       ; load counter

loop
    ; output characters loop
    lda #$41                ; load char value
    ldx .char_counter       ; load counter value
    sta ADDR_SCREEN-1,X     ; poke to screen

    lda .counter+0
    and %00000111
    sta .mask

    lda .statebuffer+1
    and %11111000
    ora .mask

    sta ADDR_YSCRL

    dec .char_counter       ; dec counter
    bne loop                ; loop

    ; 16bit counter
    dec .counter+0
    bne not_end
    dec .counter+0          ; $0 -> $ff

    dec .counter+1
    bne not_end
    jmp end

not_end
    jmp repeat

end
    lda .statebuffer+1      ; restore scroll register
    sta ADDR_YSCRL
    rts                     ; exit

setColors
    pha
    lda #5
    sta $d020
    lda #3
    sta $d021
    lda #9
    sta $0286
    pla
    rts

helper
    pha
    lda #$10
    pla
    rts

.statebuffer
    !fill 32, $aa           ; reserve 32 bytes buffer
