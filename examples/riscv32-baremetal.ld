/* 
 * RISC-V Bare-metal Embedded Linker Script 
 * Suitable for RV32I / RV32IMC Microcontrollers
 */

OUTPUT_ARCH("riscv")
ENTRY(_start)

MEMORY
{
  FLASH (rx)  : ORIGIN = 0x00000000, LENGTH = 4096K  /* 4MB Flash */
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 512K   /* 512KB SRAM */
}

SECTIONS
{
  /* The program code and other data goes into FLASH */
  .text : {
    . = ALIGN(4);
    KEEP(*(.init))
    KEEP(*(.init.*))
    *(.text)           /* .text sections (code) */
    *(.text.*)          /* .text.* sections (code) */
    *(.rodata)         /* .rodata sections (constants, strings, etc.) */
    *(.rodata.*)
    *(.srodata)        /* small constant data */
    *(.srodata.*)
    . = ALIGN(4);
    _etext = .;        /* define a global symbol at end of code */
  } > FLASH

  /* Initialized data sections into RAM, loaded from FLASH */
  .data : AT(_etext) {
    . = ALIGN(4);
    _sdata = .;        /* create a global symbol at data start */
    *(.data)           /* .data sections */
    *(.data.*)
    *(.sdata)          /* .sdata sections */
    *(.sdata.*)
    . = ALIGN(4);
    _edata = .;        /* define a global symbol at data end */
  } > RAM

  /* Uninitialized data section into RAM */
  .bss : {
    . = ALIGN(4);
    _sbss = .;         /* define a global symbol at bss start */
    *(.bss)
    *(.bss.*)
    *(.sbss)
    *(.sbss.*)
    *(COMMON)
    . = ALIGN(4);
    _ebss = .;         /* define a global symbol at bss end */
  } > RAM

  /* User stack memory allocation */
  .stack (NOLOAD) : {
    . = ALIGN(16);
    . += 0x4000;       /* 16 KB Stack */
    _stack_top = .;
  } > RAM
}
