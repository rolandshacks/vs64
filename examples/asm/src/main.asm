;
; C64 Demo
;
!src "libmacro64.asm"

+std_startup $0801, main

; declaring variables
.counter        !16 $0000   ; repeat counter
.char_counter   !08 $00     ; character output counter
.mask           !08 $00
.running        !08 $0

; -------------------------------------------------
; init
; -------------------------------------------------

init
    jsr system_init
    jsr system_disable_kernal_and_basic

    jsr video_init
    jsr sprite_init

    jsr video_clear

    lda #1
    jsr video_set_colors

    lda #0
    jsr video_set_background

    lda #6
    jsr video_set_border

    rts

; -------------------------------------------------
; run
; -------------------------------------------------

run
    pha
    txa
    pha
    ldx #3

runloop
    lda #1
    lda #2
    lda #3
    dex
    bne runloop

runend
    pla
    tax
    pla
    rts

; -------------------------------------------------
; main
; -------------------------------------------------

main
    jsr init

    +mv16im video_screen_base,addr0
    ldy #0
    lda #$4
    sta (addr0),Y

    jsr run
    rts

; -------------------------------------------------
; application data
; -------------------------------------------------

.hellotext
    !scr "HELLO WORLD!"

.statebuffer
    !fill 32, $0           ; reserve 32 bytes buffer

; -------------------------------------------------
; libraries
; -------------------------------------------------

!src "libstd64.asm"
