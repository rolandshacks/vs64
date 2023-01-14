;
; C64 Standard Library
;

; -------------------------------------------------
; System
; -------------------------------------------------

system_init
    rts

system_disable_kernal_and_basic

    +system_disable_interrupts

    +poke $dc0d, $7f
    +poke $dd0d, $7f

    lda $dc0d
    lda $dd0d

    +poke $d01a, $0
    +poke $d019, $0

    +system_mem_map $5

    +system_enable_interrupts

    rts


std_copy_charset
    +system_disable_interrupts

    lda $01

    +system_enable_interrupts
    rts


; -------------------------------------------------
; Video
; -------------------------------------------------


video_init

    lda %00000011                   ; enable CIA port A write
    sta $dd02

    lda $dd00                       ; set VIC base
    and $fc
    ora # (3 - video_vic_bank & 3)
    sta $dd00

    lda $d016                       ; set text mode
    and #$ef
    sta $d016
    lda $d011
    and #$9f
    sta $d011

    lda $d018                       ; set screen base
    and #$0f
    ora # ((video_screen_bank & $f) << 4)
    sta $d018

    jsr video_copy_charset

    lda $d018                       ; set charset base
    and #$f1
    ora # ((video_charset_bank & $f) << 1)
    sta $d018

    rts


video_copy_charset

    +system_disable_interrupts

    lda $01                         ; enable access char rom, no I/O
    sta reg0
    and #$fb
    sta $01

    ldx #0

video_copy_charset_loop

    lda video_charset_base_origin+$0,x
    sta video_charset_base+$0,x

    lda video_charset_base_origin+$100,x
    sta video_charset_base+$100,x

    lda video_charset_base_origin+$200,x
    sta video_charset_base+$200,x

    lda video_charset_base_origin+$300,x
    sta video_charset_base+$300,x

    ; TO DO MORE UNTIL $FFFF is copied

    dex
    bne video_copy_charset_loop

    lda reg0                        ; restore memory mapping
    sta $01

    +system_enable_interrupts

    rts

video_clear
    lda #$20                        ; set clear character
    jsr video_set_chars
    rts

video_set_chars ; (A = col)
    ldx #0

video_set_chars_loop
    sta video_screen_base+$0,x
    sta video_screen_base+$100,x
    sta video_screen_base+$200,x
    sta video_screen_base+$300,x
    dex
    bne video_set_chars_loop

    rts

video_set_colors ; (A = col)
    ldx #0

video_set_colors_loop
    sta video_color_base+$0,x
    sta video_color_base+$100,x
    sta video_color_base+$200,x
    sta video_color_base+$300,x
    dex
    bne video_set_colors_loop

    rts

video_set_background ; (A = col)
    sta $d021
    rts

video_set_border ; (A = col)
    sta $d020
    rts

video_put_c ; (A = char, X = x, Y = y)

    rts

; -------------------------------------------------
; Sprites
; -------------------------------------------------

sprite_init
    rts
