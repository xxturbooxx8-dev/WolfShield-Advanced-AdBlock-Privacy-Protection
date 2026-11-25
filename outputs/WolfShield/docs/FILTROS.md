# Sintaxis admitida

Cada línea es una regla. Se admiten comentarios `!`, encabezados `[Adblock Plus]`, hosts `0.0.0.0 dominio` o dominios puros. Se preserva el texto original de las listas.

| Sintaxis | Comportamiento |
| --- | --- |
| `||ads.example^` | Bloquea dominio y subdominios |
| `/ads/banner.js` | Coincidencia de URL |
| `*`, `^`, anclas `|` y `||` | Sintaxis de `urlFilter` DNR |
| `@@||cdn.example^` | Excepción de red |
| `$script,image,stylesheet,font,media,object,xmlhttprequest,xhr,subdocument,document,ping,websocket,other` | Tipos de recurso |
| `~script`, `~image`, etc. | Excluir tipo de recurso |
| `$third-party`, `$3p`, `$first-party`, `$1p` y sus negaciones | Contexto de origen clasificado por DNR |
| `$domain=news.example\|~shop.news.example` | Iniciadores incluidos y excluidos |
| `$important`, `$match-case` | Prioridad y sensibilidad a mayúsculas |
| `example.com##.banner` | Filtro cosmético de dominio |
| `##.banner` | Filtro cosmético genérico |
| `example.com#@#.banner` | Excepción cosmética |
| `~example.com##.banner` | Filtro genérico excepto en ese dominio |
| `$script,redirect=noop.js` | Solo filtros personalizados: sustitución por script local inerte |

Los modificadores se separan por comas. `domain=` usa `|` para separar dominios. Los selectores deben ser CSS estándar que el navegador admita; `:has()` está disponible donde lo soporte CSS. No se interpreta código JS ni expresiones de uBO.

No se admiten expresiones regulares ABP `/regex/`, `$popup`, `$removeparam`, `$csp`, `$redirect` arbitrario, `$badfilter`, `$generichide`, `$elemhide`, `$header`, `$denyallow`, directivas `!#include/if`, reglas HTML, selectores procedurales ni `##+js(...)`. Las directivas que comienzan por `!` se consideran comentarios; descarga listas ya expandidas. Un modificador no compatible rechaza **toda la regla**; no se elimina el modificador para ampliar accidentalmente su alcance.

Los filtros normales no bloquean navegación de primer nivel salvo `$document` explícito. Las listas de categoría “malware” sí incluyen `main_frame`. Las excepciones estándar tienen prioridad sobre bloqueos normales; `$important` sube la prioridad. Las reglas personalizadas tienen prioridad sobre las listas. La pausa de sitio tiene la prioridad máxima. Las excepciones de una lista pueden afectar otras listas en DNR; es una limitación del esquema de prioridades compartido.

Las categorías son las de la lista de origen, no una clasificación semántica de la petición. Si dos fuentes contienen el mismo bloqueo, la deduplicación conserva la primera categoría. Un evento marcado “custom” corresponde a un filtro personalizado, no se suma a anuncios o rastreadores. El contador del icono lo gestiona DNR y puede incluir redirecciones.

Los ID y el número de reglas pueden cambiar al recompilar; no son identificadores públicos persistentes. El diagnóstico muestra `parsed` (reglas de red admitidas antes de agrupar dominios), `compacted`, `selected`, `omitted`, `rejected`, `duplicates`, `cosmetic`, SHA-256 y ejemplos rechazados. `cosmetic` es el número compilado, no el número aplicado a cada página; se aplica el límite documentado por sitio.

No se aconseja crear excepciones amplias para aplicaciones sensibles. Si usas scripts de terceros bloqueados, puedes permitir un recurso concreto con `@@||cdn.example^$script,domain=mi-sitio.example`.
