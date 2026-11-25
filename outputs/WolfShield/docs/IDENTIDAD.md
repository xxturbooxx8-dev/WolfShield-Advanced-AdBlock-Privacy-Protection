# Logo oficial de WolfShield

Revisión de identidad: 25 de noviembre de 2026.

El emblema aportado por el usuario reemplaza al lobo geométrico anterior en el popup, dashboard y los iconos de ambos paquetes. Se mantiene la cara oscura para conservar el contraste sobre interfaces claras y oscuras; el exterior es transparente.

- Maestro: `assets/brand/wolfshield-master.png`, PNG con canal alfa, sin modificaciones después de la generación.
- Distribución: `public/icons/wolf.png` (512 px), iconos de 16, 32, 48, 64, 128, 256 y 512 px.
- Compatibilidad: `public/icons/wolf.svg` contiene el PNG incrustado; no es una vectorización por trazados.
- Regeneración de tamaños: `python scripts/icons.py` con Pillow. Solo redimensiona y conserva alfa.
- El archivo original aportado por el usuario no se modifica.

Edición realizada con la herramienta integrada `image_gen` (no con CLI/API externa). Prompt exacto:

```text
Use case: background-extraction / precise-object-edit. Edit target: the attached blue cybernetic wolf emblem. Prepare the official WolfShield browser-extension logo as a clean high-resolution square PNG with genuine transparent background. Preserve this exact recognisable design: symmetric angular wolf head, pointed blue outer ears, darker royal-blue inner ears, electric-blue outer outline tapering to a pointed chin, cyan cheek and muzzle strokes, white narrow eyes, white polygon nose, two small white lower fangs. Preserve the original proportions and confident expression. Remove ONLY the dark background outside the outer silhouette; keep the near-black face interior solid so the white eyes and blue details remain legible on both white and dark interfaces. Refine edges and bilateral symmetry very subtly, remove raster texture, use crisp flat vector-style shapes with the original blue/cyan colors. Center the complete emblem with about 6% transparent padding, no crop, no text, no wordmark, no shadows, no glow, no mockup, no additional elements. This is a faithful production cleanup of the supplied logo, not a redesign.
```

