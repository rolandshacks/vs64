;
; C64 Demo
;
!src "libmacro64.asm"

+std_startup $0801, main

; -------------------------------------------------
; helpers
; -------------------------------------------------

print_title
    +strcpy .hellotext, video_screen_base + 93
    rts

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
    jsr print_title
    ldx #$ff

run_loop
    dex
    bne run_loop

run_end
    pla
    tax
    pla
    rts

; -------------------------------------------------
; main
; -------------------------------------------------

main
    jsr init
    jsr run
    rts

; -------------------------------------------------
; application data
; -------------------------------------------------

.hellotext
    !scr "hello, world!",0 ; zero-terminated string

; -------------------------------------------------
; libraries
; -------------------------------------------------

!src "libstd64.asm"
