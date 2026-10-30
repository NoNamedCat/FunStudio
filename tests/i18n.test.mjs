import assert from "node:assert";
import { TRANSLATIONS } from "../src/i18n.js";

const langs = Object.keys(TRANSLATIONS).sort();
assert.deepStrictEqual(langs, ["de", "en", "es", "fr"]);

const enKeys = Object.keys(TRANSLATIONS.en).sort();
const required = ["dl_flash","flash_title","flash_pair","flash_flash","flash_boot",
  "flash_close","flash_need_compile","flash_status_idle","flash_status_flashing",
  "flash_status_done","flash_status_booted","flash_hint_pair","flash_hint_disconnect",
  "flash_hint_reconnect","flash_error_no_device","flash_error_timeout",
  "flash_error_not_bootloader","flash_error_closed"];
for (const key of required) {
  assert(enKeys.includes(key), `en missing key ${key}`);
}
for (const lang of langs) {
  assert.deepStrictEqual(Object.keys(TRANSLATIONS[lang]).sort(), enKeys,
    `lang ${lang} key-set differs from en`);
}
console.log("i18n: all tests passed");
