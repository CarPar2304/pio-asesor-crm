## Diagnóstico

El síntoma "pantalla en blanco al buscar y luego entrar a editar o al pipeline" es el patrón clásico del crash conocido de React con la **traducción automática del navegador** (Google Translate en Chrome, y el traductor integrado de Edge/Safari):

```
NotFoundError: Failed to execute 'removeChild' on 'Node':
The node to be removed is not a child of this node.
```

Cuando el traductor está activo, reemplaza nodos de texto del DOM por sus propios `<font>`. Cuando React luego intenta des-montar/re-renderizar esos nodos (al cambiar la búsqueda, abrir un diálogo, o navegar al pipeline), no los encuentra y **toda la app se desmonta** dejando la pantalla en blanco. No es un bug del navegador en sí: es una incompatibilidad documentada entre React y los traductores.

Encontré varios puntos en `Portafolio` que son exactamente el patrón que rompe React con el traductor — texto "pelado" condicional como hijo, mezclado con elementos hermanos:

- `src/components/portfolio/OfferCard.tsx` líneas 86-88: `{offer.startDate && format(...)}{offer.startDate && offer.endDate && ' → '}{offer.endDate && format(...)}`
- `src/components/portfolio/PipelineBoard.tsx` líneas 195-198: misma estructura
- Varios `{x && 'texto literal'}` y `{count || 0}` en cards de empresas y badges de etapas

Cuando el traductor traduce esos textos sueltos y React intenta removerlos (al filtrar la lista o al cambiar de vista), revienta el árbol completo → blank screen.

## Solución (dos capas)

### 1. Bloquear la traducción automática de la app (capa global)

Es la solución estándar y oficial recomendada por el equipo de React para apps con UI dinámica intensiva. La página seguirá siendo navegable; el usuario solo pierde la traducción automática del navegador, que de todas formas rompía la app.

- Añadir en `index.html` dentro de `<head>`:
  ```html
  <meta name="google" content="notranslate" />
  ```
- Añadir `translate="no"` en `<html>` (y como fallback en `<body>`).
- Mantener `lang="es"` en `<html>` (la app ya está en español, así Chrome ni siquiera ofrecerá traducir).

Esto por sí solo elimina el 99% de los crashes en blanco que describes, **incluyendo los disparados por la búsqueda + abrir editar/pipeline**.

### 2. Endurecer los puntos frágiles (capa de defensa)

Aun con el meta, conviene cerrar los patrones que React documenta como peligrosos en re-renders condicionales, para evitar regresiones si en el futuro se incrusta la app en un iframe o un usuario fuerza la traducción:

- En `OfferCard.tsx` y `PipelineBoard.tsx`, envolver los rangos de fecha en un único `<span>` y construir el string completo dentro, en vez de tres expresiones de texto adyacentes:
  ```tsx
  <span>
    {[
      offer.startDate && format(new Date(offer.startDate), 'dd MMM yyyy', { locale: es }),
      offer.endDate && format(new Date(offer.endDate), 'dd MMM yyyy', { locale: es }),
    ].filter(Boolean).join(' → ')}
  </span>
  ```
- Reemplazar `{count || 0}` por `<span>{count ?? 0}</span>` dentro de los Badges de etapas.
- Añadir un `ErrorBoundary` ligero alrededor de `<PipelineBoard>` y de la grilla de `OfferCard` en `Portafolio.tsx`, que en caso de error muestre un mensaje "Recargar" en vez de quedar en blanco. Esto sirve como red de seguridad para cualquier futuro crash de render (no solo del traductor).

### 3. Compatibilidad de navegadores

Revisado el resto del flujo (drag&drop HTML5, `framer-motion` con `AnimatePresence mode="popLayout"`, `ScrollArea` de Radix): todo es soportado por Chrome, Edge, Firefox y Safari modernos. No hay APIs experimentales. El único riesgo real de pantalla en blanco identificado en el código es el de la traducción + texto suelto condicional descrito arriba.

## Archivos a modificar

1. `index.html` — meta `notranslate` y atributo `translate="no"`.
2. `src/components/portfolio/OfferCard.tsx` — envolver rango de fechas en `<span>`.
3. `src/components/portfolio/PipelineBoard.tsx` — envolver rango de fechas y contadores condicionales.
4. `src/components/portfolio/PipelineBoard.tsx` + `src/pages/Portafolio.tsx` — montar un `ErrorBoundary` simple (componente nuevo `src/components/ErrorBoundary.tsx`) alrededor del board y de la lista de ofertas.

## Lo que NO se cambia

- No se toca la lógica de búsqueda, filtros, drag&drop ni el estado de portafolio.
- No se desactiva la traducción a nivel de cada texto del CRM (no es necesario; el meta global basta).
- No se cambia el comportamiento visible para el usuario salvo que el navegador deje de ofrecer traducir la app automáticamente.

¿Apruebas este plan para implementarlo?