# Envío directo de evidencias al Drive del IES — Guía de despliegue

**Proyecto:** STEAM4.0 VILLADIEGO (Código Escuela 4.0)
**Qué consigue:** que el botón «Generar PDF y enviar al Drive del IES» de la aplicación entregue el PDF directamente en la carpeta compartida del instituto, **sin que el profesorado tenga que conectar su cuenta de Google ni subir nada a mano**.

**Quién debe hacerlo:** una sola persona con acceso de **propietario/editor** a la carpeta compartida del Drive del IES (normalmente la coordinación del proyecto). Se hace **una sola vez** y dura unos 10 minutos.

---

## Cómo funciona (resumen)

La aplicación genera el PDF y lo envía a un pequeño servicio desplegado en la cuenta del IES (Google Apps Script). Ese servicio lo guarda en la carpeta compartida usando los permisos de la cuenta que lo despliega. Por eso ningún docente necesita permisos: quien autoriza la escritura es el propietario, una sola vez, al desplegar.

Para que un enlace público no se convierta en un buzón abierto, el servicio comprueba un **token secreto** (incluido también en la app), solo acepta **archivos PDF**, limita el tamaño a 15 MB y el total de subidas a 300 al día.

---

## Paso 1. Abrir Apps Script y crear el proyecto

1. Entra en **https://script.google.com** con la cuenta del IES propietaria de la carpeta (importante: la misma cuenta que ve la carpeta en «Mi unidad» o en «Compartido conmigo» con permiso de edición).
2. Pulsa **Nuevo proyecto** (arriba a la izquierda).
3. Arriba, donde dice **Proyecto sin título**, haz clic y renómbralo a `Subida Evidencias STEAM40 Villadiego`.

## Paso 2. Pegar el código

1. En el editor que se abre habrá un archivo `Código.gs` con una función de ejemplo (`function myFunction() {...}`). **Bórrala por completo.**
2. Abre el archivo **`apps-script/Codigo.gs`** que acompaña a esta guía, copia **todo** su contenido y pégalo en el editor.
3. Antes de guardar, revisa las tres líneas de configuración del principio:
   - `CARPETA_ID`: debe ser `1XWGHK5axfwiSNwKbM2wWnnul3ApVxBdQ` (la carpeta actual del proyecto; si algún día cambia la carpeta, actualízala aquí y en `index.html`).
   - `TOKEN_SECRETO`: es la contraseña compartida con la app. Ya viene generada y coincide con la que trae `index.html`. Si quieres rotarla, genera otra (p. ej. en https://randomkeygen.com, tipo «SHA Hash» o cualquier texto largo y aleatorio) y pégala **en los dos sitios** (aquí y en `APPS_SCRIPT_TOKEN` de `index.html`).
   - `TAMANO_MAX_MB` y `MAX_SUBIDAS_DIA`: límites anti-abuso; los valores por defecto (15 MB, 300/día) sobran para un claustro.
4. Pulsa el icono de **Guardar** (disquete).

## Paso 3. Desplegar como aplicación web

1. Arriba a la derecha, pulsa **Implementar → Nueva implementación**.
2. Junto a «Selecciona el tipo de implementación» (botón de rueda dentada), elige **Aplicación web**.
3. Rellena exactamente así:
   - **Descripción:** `Subida de evidencias STEAM40` (libre).
   - **Ejecutar como:** **Yo (tu_cuenta@educa... )** ← la cuenta con la que creaste el proyecto. **Es la opción clave**: hace que los archivos se suban con tus permisos.
   - **Quién tiene acceso:** **Cualquier usuario**. Aunque suene raro, es necesario para que la app web pública (GitHub Pages) pueda llamar al servicio; el token secreto es lo que impide que extraños lo usen.
4. Pulsa **Implementar**.
5. **Primera vez solamente:** Google pedirá autorizar el script para que pueda guardar archivos en Drive. Pulsa **Autorizar acceso → elegir tu cuenta → Avanzado (o "Ir a Subida Evidencias...") → Permitir**. Este aviso sale porque el script es personal y no está verificado por Google; es seguro, solo escribe en esa carpeta.
6. Copia la **URL de la aplicación web** que aparece (algo como `https://script.google.com/macros/s/AKfycb.../exec`). Es la URL del servicio. Guárdala: es lo que pegarás en la app.

**Comprobación rápida:** abre esa URL en el navegador (con `/exec` al final). Debe responder un JSON como `{"ok":true,"servicio":"subida-pdf-steam40-villadiego",...}`. Si lo ves, el servicio está vivo.

## Paso 4. Conectar la aplicación con el servicio

1. Abre el archivo **`index.html`** de la app (el que se publica en GitHub Pages).
2. Busca estas líneas (están hacia la línea 736, con un comentario «ENVÍO DIRECTO AL DRIVE DEL IES»):
   ```js
   const APPS_SCRIPT_URL = "";
   const APPS_SCRIPT_TOKEN = "STEAM40-VILLADIEGO-8E0612651436507648920C8CAC4D969FF3319C66";
   ```
3. Pega tu URL entre las comillas de `APPS_SCRIPT_URL` (sin espacio final, con `/exec` incluido):
   ```js
   const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   ```
4. Comprueba que el valor de `APPS_SCRIPT_TOKEN` es **idéntico** al `TOKEN_SECRETO` del paso 2 (por defecto ya coinciden).
5. Guarda y publica ambos archivos (`index.html` y `sw.js`) en el repositorio de GitHub Pages como hasta ahora.

## Paso 5. Prueba final

1. Abre la app (https://iesvilladiego.github.io/steam40/) y, si no la tenías abierta, recarga con Ctrl+F5.
2. Rellena una evidencia de prueba (o pulsa **Cargar ejemplo**) y pulsa **«Generar PDF y enviar al Drive del IES»**.
3. Debe aparecer la ventana verde **«¡Evidencia enviada a la carpeta del instituto!»** con el nombre del archivo y un botón para verlo en Drive. Comprueba en la carpeta que el PDF está ahí.
4. Si sale la ventana roja de error, usa **Reintentar** o la entrega manual, y revisa la sección de problemas frecuentes.

---

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| La app dice «El envío directo todavía no está configurado» | `APPS_SCRIPT_URL` está vacía o no se ha publicado el cambio | Completa el paso 4 y publica |
| «Token de autorización incorrecto» | `APPS_SCRIPT_TOKEN` de la app ≠ `TOKEN_SECRETO` del script | Igua­la los dos valores y vuelve a publicar la app |
| «No se ha podido enviar... HTTP 40x» o respuesta HTML | El servicio no responde JSON: URL mal copiada (falta `/exec`), o el despliegue se hizo con acceso distinto de «Cualquier usuario» | Repite el paso 3; verifica la URL con la comprobación rápida |
| «Se ha alcanzado el límite diario de subidas» | Más de 300 envíos en el día | Sube `MAX_SUBIDAS_DIA` y vuelve a desplegar |
| El PDF llega pero con nombre raro | El script sanea los nombres (quita caracteres prohibidos) | Normal; el nombre siempre conserva docente, curso y trimestre |
| Cambió la carpeta del proyecto | — | Actualiza `CARPETA_ID` en `Codigo.gs` (y `DRIVE_FOLDER_ID`/`DRIVE_FOLDER_URL` en `index.html`) y vuelve a desplegar ambos |

## Mantenimiento posterior

- **Actualizar el código del script:** pégalo en el editor y usa **Implementar → Gestionar implementaciones → ✏️ (editar) → Versión: Nueva versión → Implementar**. La URL **no cambia**, no hay que tocar la app.
- **Ver cuánto se usa:** en Apps Script, a la izquierda, **Ejecuciones** muestra cada envío (fecha y resultado).
- **Cambiar el token:** genera uno nuevo, pégalo en `TOKEN_SECRETO` (script) y `APPS_SCRIPT_TOKEN` (app), y vuelve a desplegar ambos.
- **Suspender el servicio:** Implementar → Gestionar implementaciones → 🗑️ (desactivar). La app pasará automáticamente a ofrecer la subida manual.

## Notas de seguridad

El token viaja dentro del código de la página, así que **no es secreto de criptografía**: cualquiera con la URL pública podría leerlo y, si además conociera la URL del servicio, enviar PDFs. Las contramedidas son las del propio servicio: solo PDF, máx. 15 MB, máx. 300 subidas/día y nombres saneados. Para un uso de centro educativo es más que suficiente; si algún día se abusa, rota el token y baja los límites.
