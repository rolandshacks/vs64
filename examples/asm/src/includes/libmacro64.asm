;
; C64 Macro Library
;

; -------------------------------------------------
; Program Startup
; -------------------------------------------------

;
; Generate startup BASIC code line (1973 SYS xxxx)
;
!macro __startup_basic_code {
    !word +, 1973                               ; basic line
    !byte $9e                                   ; 'SYS' command
    !byte $20                                   ; space character
    !byte $30+((+ +2)/1000)%10                  ; address digit
    !byte $30+((+ +2)/100)%10                   ; address digit
    !byte $30+((+ +2)/10)%10                    ; address digit
    !byte $30+(+ +2)%10                         ; address digit
    !byte $0                                    ; end of basic line
+   !word $0                                    ; end of basic program
}

!macro std_startup .load_address, .jump_address {
    *=.load_address                              ; set load address
    +__startup_basic_code                       ; basic startup line
    jmp .jump_address                           ; jump to label
}

!macro std_startup .load_address {
    *=.load_address                              ; set load address
    +__startup_basic_code                       ; basic startup line
}

!macro std_startup {
    +__startup_basic_code                        ; basic startup line
}

; -------------------------------------------------
; Common
; -------------------------------------------------

!macro poke .addr, .value {
    lda #.value
    sta .addr
}

; -------------------------------------------------
; Zero-Page Registers
; -------------------------------------------------

; General purpose (always available)
!addr reg0 = $fb
!addr reg1 = $fc
!addr reg2 = $fd
!addr reg3 = $fe

; General purpose (just if no RS232)
!addr reg4 = $f7
!addr reg5 = $f8
!addr reg6 = $f9
!addr reg7 = $fa

; General purpose (just if no BASIC used)
!addr regw0 = $62 ; $62+63
!addr regw1 = $64 ; $64+65
!addr regw2 = $66 ; $66+67
!addr regw3 = $68 ; $68+69

; Used for math operations (just if no BASIC used)
!addr regl0 = $6a ; $6a+6b+6c+6d

; -------------------------------------------------
; Data Handling
; -------------------------------------------------

!macro storeb .value, .addr {
    lda #.value
    sta .addr
}

!macro storew .value, .addr {
    lda #<(.value)
    sta .addr
    lda #>(.value)
    sta .addr+1
}

!macro moveb .src, .dest {
    lda .src
    sta .dest
}

!macro movew .src, .dest {
    lda .src
    sta .dest
    lda .src+1
    sta .dest+1
}

!macro movel .src, .dest {
    lda .src
    sta .dest
    lda .src+1
    sta .dest+1
    lda .src+2
    sta .dest+2
    lda .src+3
    sta .dest+3
}

!macro incw .t {
    inc .t
    bne +
    inc .t + 1
+
}

!macro decw .t {
    dec .t
    lda .t
    cmp #$ff
    bne +
    dec .t + 1
+
}

!macro beqw .val,.addr {
    lda .val
    bne +
    lda .val + 1
    beq .addr 
+
}

!macro add8 {
    clc
    txa
    sty result0
    adc result0
}

!macro add16 .a,.b {
    clc
    lda #<(.a)
    adc #<(.b)
    sta result0
    lda #>(.a)
    adc #>(.b)
    sta result1
}

; -------------------------------------------------
; Common
; -------------------------------------------------

!macro strcpy .src,.dst {
    +storew .src, regw0
    +storew .dst, regw1
    jsr strcpy_fn
}

!macro memset .dst,.val,.len {
    +storew .dst, regw0
    +storeb .val, reg0
    +storew .len, regw1
    jsr memset_fn
}

!macro memcpy .dst,.src,.len {
    +storew .dst, regw0
    +storew .src, regw1
    +storew .len, regw2
    jsr memcpy_fn
}

; -------------------------------------------------
; System
; -------------------------------------------------

!macro system_disable_interrupts {
    sei
}

!macro system_enable_interrupts {
    cli
}

!macro system_mem_map .flags {
    lda $01
    and #$f8
    ora #.flags
}

; -------------------------------------------------
; Video
; -------------------------------------------------

!set video_vic_bank = 2
!set video_screen_bank = 1
!set video_charset_bank = 1
!addr video_vic_base = video_vic_bank * $4000 ; ($8000)
!addr video_screen_base = video_vic_base + video_screen_bank * $400 ; ($8400)
!addr video_bitmap_base = video_vic_base + $2000 ; ($A000)
!addr video_color_base = $d800
!addr video_charset_base = video_vic_base + video_charset_bank * $800 ; ($8800)
!addr video_charset_base_origin = $d000

; -------------------------------------------------
; Sprites
; -------------------------------------------------

!macro sprite_line .v {
	!by .v>>16, (.v>>8)&255, .v&255
}
