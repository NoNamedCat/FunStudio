/**
 * RISC-V Hardware Timer & Machine Interrupts
 * Architecture: RV32IMC
 * Target: ESP32-C3 / RP2350 / Generic RV32
 */

#include <stdint.h>

// RISC-V Machine Status Registers (CSRs)
#define MSTATUS_MIE   (1 << 3)  // Machine Interrupt Enable
#define MIE_MTIE      (1 << 7)  // Machine Timer Interrupt Enable

// Write Control and Status Register
#define write_csr(reg, val) ({ \
    __asm__ volatile ("csrw " #reg ", %0" :: "rK"(val)); \
})

// Read Control and Status Register
#define read_csr(reg) ({ \
    uint32_t __v; \
    __asm__ volatile ("csrr %0, " #reg : "=r"(__v)); \
    __v; \
})

// Memory mapped timer registers (CLINT/MTIMECMP)
#define MTIME_LOW     (*(volatile uint32_t *)(0x0200BFF8))
#define MTIMECMP_LOW  (*(volatile uint32_t *)(0x02004000))

static volatile uint32_t system_ticks = 0;

// Interrupt Service Routine (trap handler)
void __attribute__((interrupt("machine"))) machine_trap_handler(void) {
    uint32_t mcause = read_csr(mcause);

    // Check if interrupt is Machine Timer Interrupt (bit 31 set, code 7)
    if (mcause == 0x80000007) {
        system_ticks++;
        // Schedule next timer interrupt in 1,000,000 clock cycles
        MTIMECMP_LOW = MTIME_LOW + 1000000;
    }
}

int main(void) {
    // 1. Set trap vector table
    write_csr(mtvec, (uint32_t)&machine_trap_handler);

    // 2. Set next timer threshold
    MTIMECMP_LOW = MTIME_LOW + 1000000;

    // 3. Enable Timer Interrupts in MIE and global interrupts in MSTATUS
    write_csr(mie, read_csr(mie) | MIE_MTIE);
    write_csr(mstatus, read_csr(mstatus) | MSTATUS_MIE);

    while (1) {
        // Wait for interrupt (power-saving WFI)
        __asm__ volatile ("wfi");
    }

    return 0;
}
