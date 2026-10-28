/**
 * RISC-V UART Print & Matrix Math Demo
 * Architecture: RV32IMC (Compressed + Multiply instructions)
 */

#include <stdint.h>

#define UART0_BASE   0x10013000
#define UART_TXDATA  (*(volatile uint32_t *)(UART0_BASE + 0x00))
#define UART_TXCTRL  (*(volatile uint32_t *)(UART0_BASE + 0x08))

void uart_putc(char c) {
    while ((int32_t)UART_TXDATA < 0);
    UART_TXDATA = c;
}

void uart_print(const char *str) {
    while (*str) {
        if (*str == '\n') uart_putc('\r');
        uart_putc(*str++);
    }
}

void uart_print_hex(uint32_t val) {
    const char hex[] = "0123456789ABCDEF";
    uart_print("0x");
    for (int i = 7; i >= 0; i--) {
        uart_putc(hex[(val >> (i * 4)) & 0xF]);
    }
}

int main(void) {
    UART_TXCTRL = 1; // Enable TX

    uart_print("\n========================================\n");
    uart_print("  RISC-V Web Compiler (GCC 15 WASM)\n");
    uart_print("  Hello from in-browser compiled firmware!\n");
    uart_print("========================================\n\n");

    // Math benchmark using RV32M hardware multiplier
    uint32_t a = 12345;
    uint32_t b = 67890;
    uint32_t product = a * b;

    uart_print("Computing: 12345 * 67890 = ");
    uart_print_hex(product);
    uart_print("\nDone!\n");

    return 0;
}
