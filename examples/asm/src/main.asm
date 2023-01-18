;
; C64 Demo
;
!src "libmacro64.asm"

+std_startup $0801, main

; -------------------------------------------------
; application data
; -------------------------------------------------

.hellotext
    !scr "hello, world!",0 ; zero-terminated string

!set sprite_count = 8

.sprite_colors
    !byte 2, 6, 2, 11, 2, 4, 2, 9

.sprites
    +sprite_table sprite_count

; -------------------------------------------------
; helpers
; -------------------------------------------------

print_title
    +strcpy video_screen_base + 93, .hellotext
    rts

; -------------------------------------------------
; init
; -------------------------------------------------

init
    jsr system_init                             ; initialize system
    jsr system_disable_kernal_and_basic         ; disable kernal and basic to get RAM

    jsr video_init                              ; init video and charset
    jsr sprite_init                             ; init sprites

    jsr video_clear                             ; clear screen

    lda #1
    jsr video_set_colors                        ; set color ram

    lda #0
    jsr video_set_background                    ; set background color

    lda #6
    jsr video_set_border                        ; set border color

    !for id, 0, sprite_count-1 {                  ; initialize sprites
        +sprite_set_enabled id, 1
        +sprite_set_mode id, 1
        +sprite_set_color id, .sprite_colors + id
        +sprite_set_common_colors 1, 11
    }

init_end
    rts                                         ; init end

; -------------------------------------------------
; run
; -------------------------------------------------

; references to sprite info
sprite_id !byte 0
sprite_x !word 0
sprite_y !word 0
sprite_vx !byte 0
sprite_vxsub !byte 0
sprite_vy !word 0
sprite_xdir !byte 0
sprite_ydir !byte 0
sprite_anim !byte 0
sprite_anim_delay !byte 0
sprite_anim_counter !byte 0
sprite_vx_counter !byte 0

sprites_update                                  ; update sprites
    !for id, 0, sprite_count-1 {
        !set sprite = .sprites + id * sprite_info_size

        +moveb sprite_id              , sprite + sprite_field_id
        +movew sprite_x               , sprite + sprite_field_x
        +moveb sprite_vx              , sprite + sprite_field_vx
        +moveb sprite_vxsub           , sprite + sprite_field_vxsub
        +movew sprite_y               , sprite + sprite_field_y
        +movew sprite_vy              , sprite + sprite_field_vy
        +moveb sprite_xdir            , sprite + sprite_field_xdir
        +moveb sprite_ydir            , sprite + sprite_field_ydir
        +moveb sprite_anim            , sprite + sprite_field_anim
        +moveb sprite_anim_counter    , sprite + sprite_field_anim_counter
        +moveb sprite_anim_delay      , sprite + sprite_field_anim_delay
        +moveb sprite_vx_counter      , sprite + sprite_field_vx_counter

        jsr sprite_update

        +moveb sprite + sprite_field_id             , sprite_id
        +movew sprite + sprite_field_x              , sprite_x
        +moveb sprite + sprite_field_vx             , sprite_vx
        +moveb sprite + sprite_field_vxsub          , sprite_vxsub
        +movew sprite + sprite_field_y              , sprite_y
        +movew sprite + sprite_field_vy             , sprite_vy
        +moveb sprite + sprite_field_xdir           , sprite_xdir
        +moveb sprite + sprite_field_ydir           , sprite_ydir
        +moveb sprite + sprite_field_anim           , sprite_anim
        +moveb sprite + sprite_field_anim_counter   , sprite_anim_counter
        +moveb sprite + sprite_field_anim_delay     , sprite_anim_delay
        +moveb sprite + sprite_field_vx_counter     , sprite_vx_counter

    }

    rts

sprite_update

x_move                                          ; update sprite x
    lda sprite_xdir                             ; check x direction
    bne x_move_left

x_move_right                                    ; move right

    +addbv sprite_vx_counter, sprite_vxsub      ; handle sub-pixel move
    +cmpb sprite_vx_counter, $80
    bcs +
    +subb sprite_vx_counter, $80
    +addwb sprite_x, 1
+

    +addwbv sprite_x, sprite_vx                 ; increase x
    +cmpw sprite_x, 322                         ; check right border
    bcs +
    +storew sprite_x, 322                       ; do not go beyond
    +storeb sprite_xdir, 1                      ; reverse direction
+
    jmp x_move_done

x_move_left                                     ; move left

    +addbv sprite_vx_counter, sprite_vxsub      ; handle sub-pixel move
    +cmpb sprite_vx_counter, $80
    bcs +
    +subb sprite_vx_counter, $80
    +subwb sprite_x, 1
+

    +subwbv sprite_x, sprite_vx                 ; decrease x
    +cmpw sprite_x, 24                          ; check left border
    bcc +
    +storew sprite_x, 24                        ; do not go beyond
    +storeb sprite_xdir, 0                      ; reverse direction
+
    jmp x_move_done

x_move_done                                     ; done with x


y_move                                          ; update sprite y
    lda sprite_ydir                             ; check y direction
    bne y_move_up

y_move_down                                     ; move down

    +cmpw sprite_vy, $1000                      ; handle gravity
    bcc +
    +addw sprite_vy, 80                         ; apply gravity force
+

    +storew regw0, 0                            ; increase y
    +moveb regw0, sprite_vy+1
    +addwv sprite_y, regw0

    +cmpw sprite_y, 230                         ; check bottom boundary
    bcs +
    +storew sprite_y, 230                       ; do not go below bottom
    +storew sprite_vy, $950                     ; set upwards speed
    +storeb sprite_ydir, 1                      ; reverse direction
+
    jmp y_move_done

y_move_up                                       ; move upwards
    +cmpw sprite_vy, 80                         ; handle gravity
    bcc +
    +storeb sprite_ydir, 0                      ; reverse direction
    jmp ++
+
    +subw sprite_vy, 80                         ; apply gravity force
++

    +storew regw0,0                             ; update sprite y
    +moveb regw0, sprite_vy+1
    +subwv sprite_y, regw0

    +cmpw sprite_y, 80                          ; check top boundary
    bcc +
    +storew sprite_y, 80                        ; do not go above
    +storeb sprite_ydir, 0                      ; reverse direction
+

y_move_done

    ;+storew sprite_y, 120

    +sprite_set_pos sprite_id, sprite_x, sprite_y   ; set sprite position registers

anim_update                                     ; update animation

    lda sprite_anim_counter                     ; check animation delay counter
    cmp sprite_anim_delay
    bcc anim_update_delay

    +clearb sprite_anim_counter                 ; update animation frame
    lda sprite_anim
    cmp #5                                      ; loop animation frames
    bne +
    +clearb sprite_anim
    jmp anim_update_end
+
    inc sprite_anim                             ; next animation frame
    jmp anim_update_end

anim_update_delay
    inc sprite_anim_counter                     ; increase animation delay counter

anim_update_end
    +sprite_set_data sprite_id, sprite_anim     ; update sprite data registers

sprite_update_end
    rts                                         ; sprite update end

run                                             ; run entrance
    pha                                         ; push to stack
    txa
    pha

    jsr print_title                             ; print title message to screen

run_loop
    jsr sprites_update                          ; update sprites

    lda system_emulator_flag                    ; if not in cpu emulator
    bne +
    jsr video_wait_next_frame                   ; wait for vblank
+

    jmp run_loop                                ; loop

run_end                                         ; program exit
    pla                                         ; restore from stack
    tax
    pla
    rts

; -------------------------------------------------
; main
; -------------------------------------------------

main                                            ; main entry
    jsr init                                    ; program init
    jsr run                                     ; program run loop
    rts

; -------------------------------------------------
; libraries
; -------------------------------------------------

!src "libstd64.asm"
!src "sprites.asm"
