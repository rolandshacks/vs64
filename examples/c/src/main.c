//
// Main
//

#include <stdbool.h>
#include <stdint.h>

#include <sys.h>

///////////////////////////////////////////////////////////////////////////////
// Compiler Pragmas
///////////////////////////////////////////////////////////////////////////////

#pragma static-locals(on)

///////////////////////////////////////////////////////////////////////////////
// Global Flags
///////////////////////////////////////////////////////////////////////////////

static const bool enable_audio = true;
static const bool enable_sprites = true;
static const bool enable_starfield = true;

///////////////////////////////////////////////////////////////////////////////
// Starfield
///////////////////////////////////////////////////////////////////////////////

struct star_tag {
    uint8_t x;
    uint8_t shift;
    uint8_t speed;
};

typedef struct star_tag star_t;

#define num_stars 5
star_t stars[num_stars] = {};
const uint8_t star_char_base = 0x21; // 0x21..0x28
const uint8_t star_color[] = { 0xf, 0xc, 0x1 };
const uint8_t stars_y = 3;
const uint8_t step_size = 5;

void starfield_init() {

    int i;
    uint8_t* ptr;

    uint8_t* charset = video_get_character_base();

    // clear screen
    video_set_chars(0x20);
    video_set_colors(1);

    // prepare charset
    for (i=0; i<8; i++) {
         ptr = charset + (star_char_base + i) * 8;
         memset(ptr, 0, 8);
         *ptr = (1<<i);
    }

    // init stars
    for (i=0; i<num_stars; i++) {
        stars[i].x = aux_rand() % 104; // 40+64
        stars[i].shift = 0;
        stars[i].speed = 1 + (i%3);
    }

    // init color buffer
    i = stars_y;
    ptr = (uint8_t*) video_get_color_base() + i * 40;
    while (i < 25) {
        memset(ptr, star_color[i%3], 40);
        ptr += (size_t) (40 * step_size);
        i += step_size;
    }

}

star_t* star;
void starfield_update() {

    int i;
    uint8_t y = stars_y;

    for (i=0; i<num_stars; i++) {

        star = &stars[i];

        if (y >= 25) break;

        if (star->x >= 40) {
            star->x--;
            y += step_size;
            continue;
        }

        star->shift += star->speed;
        if (star->shift >= 8) {
            star->shift -= 8;
            video_putc(star->x, y, 0x20);
            if (star->x == 0) {
                star->x = 40 + (aux_rand()>>2);
                y += step_size;
                continue;
            } else {
                star->x--;
            }
        }

        video_putc(star->x, y, (char) star_char_base + star->shift);
        y += step_size;

    }

}

///////////////////////////////////////////////////////////////////////////////
// Sprites
///////////////////////////////////////////////////////////////////////////////

struct sprite_tag {
    uint8_t id;
    int16_t x;
    int16_t y;
    int16_t vx;
    int16_t vy;
    uint8_t address;
    uint8_t animation;
    uint16_t animation_counter;
    int16_t vanimation;
};

typedef struct sprite_tag sprite_t;

#define sprite_count 4

sprite_t sprites[sprite_count] = {};
uint8_t sprite_colors[] = {2,6,2,11,2,4,2,9};

void sprite_update_pos(sprite_t* sprite) {
    uint16_t sx = (sprite->x > 0) ? sprite->x : 0;
    uint16_t sy = (sprite->y > 0) ? sprite->y : 0;
    sprite_set_pos(sprite->id, sx>>3, sy>>3);
}

void sprites_init() {
    int i;
    uint8_t id;
    uint8_t block_index = sprite_get_address(NULL);
    sprite_t* sprite;
    uint8_t col;

    sprite_set_common_colors(1, 11);

    for (i=0; i<sprite_count; i++) {
        sprite = &sprites[i];
        id = (uint8_t) i;
        sprite->id = id;

        col = sprite_colors[i];

        sprite_set_address(id, block_index);
        sprite_set_enabled(id, true);
        sprite_set_mode(id, true);
        sprite_set_color(id, col);

        sprite->x = (int16_t) (320 / 3 + i * 300);
        sprite->y = (int16_t) (- i * 100);
        sprite->vx = (int16_t) (25 + i);
        sprite->vy = (int16_t) (- i * 30);
        sprite->address = 0;
        sprite->animation = 0;
        sprite->animation_counter = 0;
        sprite->vanimation = 96 + (id % 3) * 16;

        sprite_set_address(sprite->id, 0);
        sprite_update_pos(sprite);

    }
}

void sprites_update() {

    int i;
    sprite_t* sprite;
    int16_t n;
    int16_t m;
    int16_t k;

    for (i=0; i<sprite_count; i++) {
        sprite = &sprites[i];

        // Y movement

        n = sprite->y;
        m = sprite->vy;

        n += m;
        if (n > 1847) {
            n = 1847;
            m = -80;
        }

        m += 3;
        if (m > 80) m = 80;

        sprite->y = n;
        sprite->vy = m;

        // X movement

        n = sprite->x;
        m = sprite->vx;

        n += m;
        if (n > 2591) {
            n = 2591;
            m = -m;
        } else if (n < 192) {
            n = 192;
            m = -m;
        }

        sprite->x = n;
        sprite->vx = m;

        // animation

        n = sprite->animation;
        m = sprite->animation_counter;
        k = sprite->vanimation;

        m = (m + k) & 0xffff;
        if (m & 0xff00) {
            m &= 0x00ff;
            if (sprite->vx >= 0) {
                if (n > 0) n--; else n=5;
            } else {
                if (n < 5) n++; else n=0;
            }

        }

        sprite->animation = n;
        sprite->animation_counter = m;

        // update sprite registers
        sprite_set_address(sprite->id, sprite->address + n);
        sprite_update_pos(sprite);
    }

}

///////////////////////////////////////////////////////////////////////////////
// Control Loop
///////////////////////////////////////////////////////////////////////////////

void init() {
    system_init();
    system_disable_kernal_and_basic();

    video_init();
    sprite_init();

    if (enable_starfield) starfield_init();

    video_clear();
    video_set_background(0);
    video_set_border(0);

    if (enable_sprites) sprites_init();
    if (enable_audio) audio_init();
}

int main() {

    init();

    video_puts(15, 0, "Hello World", 8);

    for (;;) {
        if (enable_sprites) sprites_update();
        if (enable_starfield) starfield_update();
        video_wait_next_frame();
    }

    return 0;
}
