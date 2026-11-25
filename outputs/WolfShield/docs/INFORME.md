# Informe de entrega — WolfShield 1.0.0

Validación completada el **25 de noviembre de 2026**, zona del usuario America/Bogota. Evidencia del navegador: 2026-11-25T05:11:29.687Z (UTC). Entorno: Windows, Node.js 24.22.3, Chromium 141.0.7390.37 de Playwright en perfil aislado.

## Resultado comprobado

- **19/19 pruebas unitarias aprobadas** mediante node:test; TypeScript estricto sin errores.
- **22/22 pruebas de integración aprobadas** en Chromium. Cero errores JavaScript de la aplicación capturados.
- 14367 reglas DNR instaladas con las preferencias iniciales. 0 reglas de red compatibles omitidas por cupo en esta instantánea. 4024 líneas rechazadas por sintaxis no compatible; no se presenta como soporte completo de las listas.
- Bloqueo real de solicitudes de publicidad y rastreo con el error del navegador ERR_BLOCKED_BY_CLIENT. Las pruebas no sustituyeron las peticiones por resultados simulados.
- CSS existente y dinámico, pausa/restauración, selector visual guardando reglas, limpieza de URL, reglas locales de sustitución, adaptadores tempranos y fingerprinting estricto validados en una página de prueba controlada.
- Configuración y bloqueo persistieron al cerrar y relanzar el navegador.
- WebRTC/cookies de terceros aplicados y liberados; popups/notificaciones verificados mediante las APIs del navegador. Rechazo de mutaciones privilegiadas originadas en content scripts.
- Descarga real y aplicación de las cuatro suscripciones HTTPS verificadas; alarma de 24 horas creada. No se esperaron 24 horas para observar su disparo.
- Capturas del popup y dashboard oscuro/claro inspeccionadas. Los números mostrados provienen de pruebas reales en el perfil aislado, no de datos de producción ni valores de ejemplo añadidos al producto.

## Listas incluidas

| Lista | Reglas de origen admitidas | Reglas DNR seleccionadas | Omitidas por cupo | Rechazadas |
| --- | ---: | ---: | ---: | ---: |
| easylist | 50216 | 3868 | 0 | 3823 |
| easyprivacy | 56745 | 9362 | 0 | 84 |
| spanish | 618 | 581 | 0 | 117 |
| malware | 134708 | 540 | 0 | 0 |

Las condiciones por destino e iniciador pueden dividir una regla en dos. La agrupación de hasta 500 dominios por regla permite representar listas grandes sin consumir una regla por dominio. La deduplicación entre listas hace que la suma por lista pueda diferir del total instalado. Las reglas de limpieza se añaden aparte. Los selectores cosméticos tienen límites independientes: 500 genéricos y 2.000 totales por documento.

## Pruebas de integración

| Verificación | Resultado | Tiempo de prueba |
| --- | --- | ---: |
| Default lists install real DNR rules | PASS | 1237 ms |
| Default advertising and tracking domain rules match | PASS | 4 ms |
| Custom network filter blocks a real HTTP request | PASS | 6853 ms |
| Cosmetic filter hides existing and dynamically added ads, preserves content | PASS | 21 ms |
| Statistics come from observed request events | PASS | 1517 ms |
| Real advertising and tracker requests fail with ERR_BLOCKED_BY_CLIENT | PASS | 4 ms |
| Site pause allows the request and restores cosmetic content | PASS | 6406 ms |
| Main-world adapter runs before inline detection and preserves empty baits | PASS | 5659 ms |
| Local inert script replacement prevents original execution | PASS | 5660 ms |
| URL cleanup removes tracking parameters and preserves other data | PASS | 14 ms |
| Per-site cleanup overrides work for direct address-bar navigations | PASS | 14940 ms |
| Strict fingerprint controls deny canvas and offline audio readback | PASS | 854 ms |
| Disabling strict mode restores canvas after reload | PASS | 878 ms |
| Malicious-domain default navigation is matched without visiting it | PASS | 11 ms |
| Element picker saves a real domain-scoped filter | PASS | 1089 ms |
| Settings survive service-worker restart and browser relaunch | PASS | 1911 ms |
| Dashboard and popup render without application errors | PASS | 2963 ms |
| Content scripts cannot mutate privileged settings | PASS | 10 ms |
| Global privacy settings apply and release browser control | PASS | 1882 ms |
| Invalid import rejected and previous configuration preserved | PASS | 9 ms |
| HTTPS subscription refresh applies lists and daily alarm exists | PASS | 6689 ms |
| Statistics deletion clears persisted events | PASS | 9 ms |

Tiempos de pruebas, no mediciones del impacto sobre navegación real. El microbenchmark unitario compiló 30.000 filtros sintéticos en aproximadamente 44 ms en la ejecución registrada; no representa el rendimiento de cualquier equipo o lista. No se realizó un benchmark controlado de RAM, CPU en sitios reales o ahorro de ancho de banda.

## Alcance de la entrega

Incluye código TypeScript organizado y legible, manifiestos independientes, motor DNR, compilador ABP parcial, CSS por dominio, selector, privacidad, scriptlets locales, listas originales con hashes y licencias, popup, dashboard, 7 tamaños PNG y SVG original, pruebas automatizadas, documentación y ZIP instalables descomprimidos.

**Chromium está probado.** Chrome, Brave y Edge comparten las APIs utilizadas, pero no se probaron por separado en esta entrega. **Firefox tiene adaptación compilada, aún no validada en ejecución.** No se ha publicado en tiendas ni firmado. La instalación usa modo de desarrollador; en Firefox la carga temporal no persiste después de reiniciar.

## Límites y funciones parciales

- No es una réplica completa de uBlock Origin o Brave. Rechaza sintaxis avanzada, selectores procedurales y scriptlets remotos. No hay una biblioteca exhaustiva de parches específicos para sitios comerciales.
- Anti-AdBlock: patrones locales concretos y señuelos vacíos; no invisibilidad universal, paywalls ni controles de acceso.
- Vídeo: bloqueo de red según filtros; no se garantiza retirar anuncios integrados en el mismo flujo o en el mismo origen del contenido.
- Fingerprinting: experimental, opt-in, detectabilidad conocida, solo marco principal y APIs documentadas. No se afirma anonimato ni cobertura de workers, todos los iframes o todas las huellas.
- HTTPS: forzado, sin detección previa ni retorno automático a HTTP. URLs firmadas pueden requerir excepciones a la limpieza.
- Avisos de cookies: filtrado visual mediante Fanboy opcional; ocultarlos no significa rechazar consentimiento. La API de cookies es una protección separada.
- Desglose estadístico: depende del feedback DNR disponible para instalaciones descomprimidas. Se muestra no disponible cuando no puede obtenerse. No se registran URLs completas de navegación.
- Ventanas/notificaciones dependen de contentSettings, ausente en Firefox. Las preferencias globales de navegador conservan el alcance descrito en README.
- Cobertura real: pruebas controladas y solicitudes concretas, sin validación masiva de compatibilidad en páginas comerciales. Las listas pueden producir falsos positivos.
- No hay publicación, firma, auditoría externa ni certificación de seguridad. SHA-256 valida los archivos distribuidos; un hash calculado localmente no autentica al mantenedor de una lista.

## Evidencia y reproducción

[Resultados JSON](browser-results.json), [diagnóstico inicial](initial-diagnostics.json), [dashboard oscuro](screenshots/dashboard.png), [dashboard claro](screenshots/dashboard-light.png), [popup](screenshots/popup.png).

Comandos: npm ci; npm run check; npm test; npm run build; npx playwright install chromium; npm run test:browser. Las pruebas usan un perfil separado y no alteran el perfil personal. Consulta README.md para instalación y permisos, FILTROS.md para sintaxis, THIRD_PARTY_NOTICES.md para licencias.
