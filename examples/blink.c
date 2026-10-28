/**
 * RISC-V Bare-metal GPIO Blink Demo
 * Targets: RV32IMC (ESP32-C3, CH32V, RP2350, FE310)
 */

#include <stdint.h>

#define GPIO_BASE   0x10012000
#define GPIO_OUTPUT_EN  (*(volatile uint32_t *)(GPIO_BASE + 0x08))
#define GPIO_OUTPUT_VAL (*(volatile uint32_t *)(GPIO_BASE + 0x0C))

#define LED_PIN (1 << 5)

static void delay_cycles(volatile uint32_t cycles) {
    while (cycles--) {
        __asm__ volatile("nop");
    }
}

int main(void) {
    // Enable GPIO output for LED
    GPIO_OUTPUT_EN |= LED_PIN;

    while (1) {
        // LED ON
        GPIO_OUTPUT_VAL |= LED_PIN;
        delay_cycles(1000000);

        // LED OFF
        GPIO_OUTPUT_VAL &= ~LED_PIN;
        delay_cycles(1000000);
    }

    return 0;
}
