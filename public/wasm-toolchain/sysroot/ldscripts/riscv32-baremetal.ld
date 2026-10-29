OUTPUT_ARCH("riscv")
ENTRY(_start)

MEMORY
{
  FLASH (rx)  : ORIGIN = 0x00000000, LENGTH = 4M
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 512K
}

SECTIONS
{
  .text : {
    . = ALIGN(4);
    KEEP(*(.init))
    KEEP(*(.init.*))
    *(.text)
    *(.text.*)
    *(.rodata)
    *(.rodata.*)
    . = ALIGN(4);
    _etext = .;
  } > FLASH

  .data : AT(_etext) {
    . = ALIGN(4);
    _sdata = .;
    *(.data)
    *(.data.*)
    *(.sdata)
    *(.sdata.*)
    . = ALIGN(4);
    _edata = .;
  } > RAM

  .bss : {
    . = ALIGN(4);
    _sbss = .;
    *(.bss)
    *(.bss.*)
    *(.sbss)
    *(.sbss.*)
    *(COMMON)
    . = ALIGN(4);
    _ebss = .;
  } > RAM

  .stack (NOLOAD) : {
    . = ALIGN(16);
    . += 0x2000; /* 8 KB stack */
    _stack_top = .;
  } > RAM
}
