;
; C64 Standard Library
;

std_disable_kernal_and_basic

    +std_disable_interrupts

    +poke $dc0d, $7f
    +poke $dd0d, $7f

    lda $dc0d
    lda $dd0d

    +poke $d01a, $0
    +poke $d019, $0

    +std_configure_memory $5

    +std_enable_interrupts

    rts


std_copy_charset
    +std_disable_interrupts

    lda $01

    +std_enable_interrupts
    rts
