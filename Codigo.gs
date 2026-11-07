/**
 * =====================================================================
 *  SUBIDA DIRECTA DE PDFs — PROYECTO STEAM VILLADIEGO (Código Escuela 4.0)
 * =====================================================================
 *
 *  Qué hace este script:
 *    Recibe el PDF que genera la aplicación
 *    (https://iesvilladiego.github.io/steam40/) y lo guarda directamente
 *    en la carpeta compartida del Google Drive del IES, usando los
 *    permisos de la cuenta que lo despliega. Así el profesorado no
 *    necesita conectar su Google ni tener permiso sobre la carpeta.
 *
 *  Cómo se despliega (resumen — pasos detallados en
 *  INSTRUCCIONES_DESPLIEGUE.md):
 *    1. script.google.com → Nuevo proyecto.
 *    2. Pegar TODO este código en el editor (sustituyendo lo que haya).
 *    3. Implementar → Nueva implementación → Aplicación web:
 *         - Ejecutar como: Yo (tu cuenta del IES)
 *         - Quién tiene acceso: Cualquier usuario
 *    4. Copiar la URL /exec y pegarla en la constante APPS_SCRIPT_URL
 *       del archivo index.html de la app.
 *
 *  Seguridad:
 *    - La app envía un token secreto que debe coincidir con
 *      TOKEN_SECRETO (evita que cualquiera que encuentre la URL
 *      pueda colar archivos).
 *    - Solo se aceptan archivos PDF de hasta TAMANO_MAX_MB.
 *    - Máximo MAX_SUBIDAS_DIA subidas al día en total.
 * =====================================================================
 */

// ── CONFIGURACIÓN: revisa estos valores antes de desplegar ──────────

// Carpeta destino (la misma que usa la app).
var CARPETA_ID = '1XWGHK5axfwiSNwKbM2wWnnul3ApVxBdQ';

// Token secreto compartido con la app: DEBE coincidir con la constante
// APPS_SCRIPT_TOKEN del archivo index.html. Si lo cambias aquí,
// cámbialo también allí y vuelve a publicar la app.
var TOKEN_SECRETO = 'STEAM40-VILLADIEGO-8E0612651436507648920C8CAC4D969FF3319C66';

// Límite de tamaño del PDF recibido.
var TAMANO_MAX_MB = 15;

// Límite global de subidas por día (protección anti-abuso).
var MAX_SUBIDAS_DIA = 300;

// Si el mismo docente reenvía la misma evidencia (mismo nombre de
// archivo), la versión anterior se sustituye en la carpeta en lugar de
// acumular duplicados. Ponlo a false si prefieres conservarlas todas.
var REEMPLAZAR_MISMO_NOMBRE = true;

// ─────────────────────────────────────────────────────────────────────


/**
 * Punto de entrada de la app: recibe un POST con JSON
 * { token, nombre, mime, datosBase64 } y guarda el PDF en la carpeta.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responder({ ok: false, error: 'La petición no incluye datos.' });
    }

    var peticion;
    try {
      peticion = JSON.parse(e.postData.contents);
    } catch (err) {
      return responder({ ok: false, error: 'La petición no es un JSON válido.' });
    }

    // 1) Token de autorización
    if (!peticion.token || peticion.token !== TOKEN_SECRETO) {
      return responder({ ok: false, error: 'Token de autorización incorrecto.' });
    }

    // 2) Campos obligatorios y tipo de archivo
    if (!peticion.nombre || !peticion.datosBase64) {
      return responder({ ok: false, error: 'Faltan el nombre o el contenido del PDF.' });
    }
    if (peticion.mime && peticion.mime !== 'application/pdf') {
      return responder({ ok: false, error: 'Solo se aceptan archivos PDF.' });
    }

    // 3) Decodificar y validar el contenido
    var bytes;
    try {
      bytes = Utilities.base64Decode(peticion.datosBase64);
    } catch (err) {
      return responder({ ok: false, error: 'El contenido del PDF no está bien codificado.' });
    }
    if (!bytes || bytes.length === 0) {
      return responder({ ok: false, error: 'El contenido del PDF está vacío.' });
    }
    if (bytes.length > TAMANO_MAX_MB * 1024 * 1024) {
      return responder({ ok: false, error: 'El PDF supera el máximo de ' + TAMANO_MAX_MB + ' MB.' });
    }

    // 4) Límite diario de uso
    if (!permitirPorLimiteDiario()) {
      return responder({ ok: false, error: 'Se ha alcanzado el límite diario de subidas. Inténtalo mañana o avisa a la coordinación.' });
    }

    // 5) Guardar en la carpeta del IES
    var nombre = sanearNombre(peticion.nombre);
    var carpeta = DriveApp.getFolderById(CARPETA_ID);

    if (REEMPLAZAR_MISMO_NOMBRE) {
      var anteriores = carpeta.getFilesByName(nombre);
      while (anteriores.hasNext()) {
        anteriores.next().setTrashed(true); // queda en la papelera, recuperable
      }
    }

    var archivo = carpeta.createFile(
      Utilities.newBlob(bytes, 'application/pdf', nombre)
    );

    return responder({
      ok: true,
      nombre: nombre,
      id: archivo.getId(),
      url: archivo.getUrl()
    });

  } catch (err) {
    return responder({
      ok: false,
      error: 'Error del servidor: ' + (err && err.message ? err.message : String(err))
    });
  }
}


/**
 * Comprobación de estado: al abrir la URL /exec en el navegador
 * responde con este JSON (útil para verificar el despliegue).
 */
function doGet(e) {
  return responder({
    ok: true,
    servicio: 'subida-pdf-steam40-villadiego',
    carpeta: CARPETA_ID,
    uso: 'POST con JSON { token, nombre, mime, datosBase64 }'
  });
}


/* ---------------------------------------------------------------------
 * Funciones auxiliares
 * ------------------------------------------------------------------ */

// Responde siempre JSON (la app lee esta respuesta).
function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// Deja el nombre de archivo en condiciones: sin rutas, sin caracteres
// prohibidos, longitud limitada y siempre terminado en .pdf.
function sanearNombre(nombre) {
  var s = String(nombre)
    .replace(/[\\\/:*?"<>|]/g, '')   // caracteres prohibidos en nombres de archivo
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);

  if (!/\.pdf$/i.test(s)) s += '.pdf';
  if (!s || s === '.pdf') {
    s = 'Evidencia_STEAM4.0_' +
        Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyyMMdd_HHmmss') + '.pdf';
  }
  return s;
}

// Cuenta las subidas del día en las propiedades del script.
// Si el propio control falla, se permite la subida (mejor de más que de menos).
function permitirPorLimiteDiario() {
  try {
    var props = PropertiesService.getScriptProperties();
    var hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
    var clave = 'subidas_' + hoy;
    var n = Number(props.getProperty(clave) || 0);
    if (n >= MAX_SUBIDAS_DIA) return false;
    props.setProperty(clave, String(n + 1));
    return true;
  } catch (err) {
    return true;
  }
}
