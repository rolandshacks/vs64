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
; System
; -------------------------------------------------

!macro std_disable_interrupts {
    sei
}

!macro std_enable_interrupts {
    cli
}

!macro std_configure_memory .flags {
    lda $01
    and #$f8
    ora #.flags
}

!macro poke .addr, .value {
    lda #.value
    sta .addr
}
