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

!addr byte0 = $fb
!addr byte1 = $fc
!addr byte2 = $fd
!addr byte3 = $fe

; General purpose (just if no RS232)
!addr reg4 = $f7
!addr reg5 = $f8
!addr reg6 = $f9
!addr reg7 = $fa

!addr byte4 = $fb
!addr byte5 = $fc
!addr byte6 = $fd
!addr byte7 = $fe

; General purpose (just if no BASIC used)
!addr addr0 = $62 ; $62+63
!addr addr1 = $64 ; $64+65
!addr addr2 = $66 ; $66+67
!addr addr3 = $68 ; $68+69

!addr short0 = $62 ; $62+63
!addr short1 = $64 ; $64+65
!addr short2 = $66 ; $66+67
!addr short3 = $68 ; $68+69

; Used for math operations (just if no BASIC used)
!addr math0 = $6a
!addr math1 = $6b
!addr math2 = $6c
!addr math3 = $6d

; -------------------------------------------------
; Math
; -------------------------------------------------

!macro inc16 .t {
    inc .t
    bne .j; "*" syntax not used here because size of ".t" is unknown
    inc .t + 1
    .j
}

!macro mv16im .wort, .mem {
    lda #<(.wort)
    sta .mem
    lda #>(.wort)
    sta .mem+1
}

!macro mv16ab .wort, .mem {
    lda .wort
    sta .mem
    lda .wort+1
    sta .mem+1
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
!addr video_vic_base = video_vic_bank * $4000
!addr video_screen_base = video_vic_base + video_screen_bank * $400
!addr video_bitmap_base = video_vic_base + $2000
!addr video_color_base = $d800
!addr video_charset_base = video_vic_base + video_charset_bank * $800
!addr video_charset_base_origin = $d000
