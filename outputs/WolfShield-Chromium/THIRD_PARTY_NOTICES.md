# Autoría y licencias de terceros

El código y el lobo geométrico de WolfShield son originales de este proyecto; GPL-3.0-only. No se han copiado marcas, logos ni código de Brave o uBlock Origin.

Las listas no son autoría de WolfShield. Las copias en `assets/lists` / `dist/*/lists` se conservan sin modificación. El índice SHA-256 identifica las versiones distribuidas. La compilación y el recorte de reglas los realiza WolfShield y no deben atribuirse a los autores de las listas.

| Fuente | Autoría y licencia / condiciones | Distribución |
| --- | --- | --- |
| EasyList, EasyPrivacy | The EasyList authors, https://easylist.to/ — GPL-3.0-or-later o CC-BY-SA-3.0-or-later; esta distribución elige GPL | Texto original incluido |
| EasyList Spanish | EasyList Spanish maintainers; licencia indicada en la cabecera: https://easylist.to/pages/licence.html | Texto original incluido |
| HaGeZi Threat Intelligence Mini | HaGeZi y colaboradores — GPL-3.0, https://github.com/hagezi/dns-blocklists/blob/main/LICENSE | Texto original incluido |
| Fanboy’s Annoyances | EasyList/Fanboy maintainers — licencias de EasyList | URL de suscripción, descarga opcional |
| AdGuard Base | AdGuard Software Ltd. y colaboradores — GPL-3.0-only, https://github.com/AdguardTeam/AdguardFilters/blob/master/LICENSE | URL de suscripción, descarga opcional |
| Peter Lowe’s List | Peter Lowe — https://pgl.yoyo.org/adservers/ y https://pgl.yoyo.org/as/policy.php | Solo enlace; no se redistribuye copia |

El texto completo GPLv3 se incluye en `licenses/GPL-3.0.txt`. Fuentes y condiciones de EasyList: https://easylist.to/pages/licence.html. Los filtros aportados por el usuario conservan sus licencias originales; verifica sus términos antes de redistribuirlos.

Herramientas de desarrollo, fijadas en `package-lock.json`: TypeScript (Apache-2.0), esbuild (MIT), Playwright (Apache-2.0), @types/chrome y paquetes de tipos relacionados (MIT). Sus paquetes de desarrollo no están incluidos en los ZIP de instalación. El código de la extensión no contiene dependencias JS de ejecución de terceros. Pillow se usa solo para rasterizar los polígonos originales en la regeneración opcional de iconos.
