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
; main
; -------------------------------------------------

main
    jsr init
    jsr run
    rts

; -------------------------------------------------
; init
; -------------------------------------------------

init
    jsr std_disable_kernal_and_basic
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
; application data
; -------------------------------------------------

.statebuffer
    !fill 32, $0           ; reserve 32 bytes buffer

; -------------------------------------------------
; libraries
; -------------------------------------------------

!src "libstd64.asm"
